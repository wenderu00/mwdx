import { z } from "zod";

// Contrato entre plugin (agentes), CLI (ingest) e dashboard.
// Os agentes escrevem JSON em ~/.mwdx/runs/<repo>/<ts>/; o hook do plugin e o
// `mwdx ingest` validam com estes schemas. JSON Schema gerado em plugin/schemas/.

export const DIMENSOES = ["higiene", "arquitetura", "portfolio"] as const;
export const Dimensao = z.enum(DIMENSOES);
export type Dimensao = z.infer<typeof Dimensao>;

export const StatusAchado = z.enum([
  "aberto",
  "em_andamento",
  "adiado",
  "ignorado",
  "resolvido",
  "regrediu",
]);
export type StatusAchado = z.infer<typeof StatusAchado>;

const texto = z.string().trim().min(1);

// Uma evidência aponta para algo verificável: um arquivo do repo, a saída de um
// comando registrado em execucao.json, ou um metadado do GitHub.
export const EvidenciaArquivo = z.strictObject({
  arquivo: texto.describe("Caminho relativo à raiz do repo (ausência também vale: ex. '.github/')"),
  linha: z.int().positive().optional(),
  obs: texto,
});
export const EvidenciaExecucao = z.strictObject({
  execucao: texto.describe("Comando exatamente como aparece em execucao.json"),
  obs: texto,
});
export const EvidenciaGithub = z.strictObject({
  github: texto.describe("Campo de contexto.json → github (ex. 'pushed_at', 'issues_abertas')"),
  obs: texto,
});
export const Evidencia = z.union([EvidenciaArquivo, EvidenciaExecucao, EvidenciaGithub]);
export type Evidencia = z.infer<typeof Evidencia>;

const escala = z.int().min(1).max(3);

export const AchadoNovo = z.strictObject({
  tipo: z.enum(["lacuna", "oportunidade"]),
  titulo: texto.max(120),
  evidencias: z.array(Evidencia).min(1),
  impacto: escala.describe("1 = cosmético, 2 = relevante, 3 = crítico/alto retorno"),
  esforco: escala.describe("1 = < 1h, 2 = um dia, 3 = vários dias"),
  acao: texto.min(20).describe("O que fazer, concreto o bastante para virar prompt de correção"),
});
export type AchadoNovo = z.infer<typeof AchadoNovo>;

export const Reconciliacao = z.strictObject({
  id: texto,
  veredito: z.enum(["persistente", "resolvido", "regrediu"]),
  evidencias: z.array(Evidencia).min(1),
});
export type Reconciliacao = z.infer<typeof Reconciliacao>;

export const RelatorioDimensao = z.strictObject({
  repo: texto,
  dimensao: Dimensao,
  nota: z.int().min(0).max(100),
  justificativa: texto,
  reconciliacao: z.array(Reconciliacao),
  achados_novos: z.array(AchadoNovo),
});
export type RelatorioDimensao = z.infer<typeof RelatorioDimensao>;

export const ComandoExecutado = z.strictObject({
  etapa: z.enum(["install", "test", "build", "audit", "lint", "outro"]),
  comando: texto,
  exit_code: z.int().nullable().describe("null = timeout"),
  duracao_s: z.number().nonnegative(),
  resumo: texto.describe("Trecho relevante da saída: contagens, erros, vulnerabilidades"),
});
export type ComandoExecutado = z.infer<typeof ComandoExecutado>;

export const Execucao = z.strictObject({
  repo: texto,
  status: z.enum(["ok", "parcial", "sem_stack", "sem_container"]),
  stack: z.string().nullable(),
  imagem: z.string().nullable(),
  comandos: z.array(ComandoExecutado),
  observacoes: z.string(),
});
export type Execucao = z.infer<typeof Execucao>;

// Escrito pela CLI (não pelos agentes): o que a análise precisa saber de antes.
export const AchadoExistente = AchadoNovo.extend({
  id: texto,
  dimensao: Dimensao,
  status: StatusAchado,
});
export type AchadoExistente = z.infer<typeof AchadoExistente>;

export const Contexto = z.strictObject({
  repo: texto,
  head_sha: z.string().nullable(),
  container: z.string().nullable(),
  stack: z.string().nullable(),
  imagem: z.string().nullable(),
  github: z.record(z.string(), z.unknown()),
  // abertos/em_andamento/adiado/regrediu: o especialista deve reconciliar cada um da sua dimensão
  achados_ativos: z.array(AchadoExistente),
  // resolvidos: só reconciliar se voltaram (veredito "regrediu")
  achados_resolvidos: z.array(AchadoExistente),
  ignorados: z.array(z.strictObject({ id: texto, dimensao: Dimensao, titulo: texto, motivo: texto })),
});
export type Contexto = z.infer<typeof Contexto>;

export const AchadoTransversal = AchadoNovo.extend({
  repos: z.array(texto).min(1),
});

export const Transversal = z.strictObject({
  achados_novos: z.array(AchadoTransversal),
  fixar_no_perfil: z.array(z.strictObject({ repo: texto, motivo: texto })).max(6),
  arquivar: z.array(z.strictObject({ repo: texto, motivo: texto })),
});
export type Transversal = z.infer<typeof Transversal>;

export const ARQUIVOS_RUN = {
  "execucao.json": Execucao,
  "higiene.json": RelatorioDimensao,
  "arquitetura.json": RelatorioDimensao,
  "portfolio.json": RelatorioDimensao,
  "contexto.json": Contexto,
  "transversal.json": Transversal,
} as const;
export type ArquivoRun = keyof typeof ARQUIVOS_RUN;

export function ehArquivoRun(nome: string): nome is ArquivoRun {
  return Object.hasOwn(ARQUIVOS_RUN, nome);
}

// Validação de schema + regras que cruzam arquivos. Retorna mensagens em
// português, prontas para voltar ao agente como feedback.
export function validarArquivoRun(
  nome: ArquivoRun,
  dados: unknown,
  contexto?: Contexto | null,
): string[] {
  const r = ARQUIVOS_RUN[nome].safeParse(dados);
  if (!r.success) {
    return r.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`);
  }
  if (nome === "higiene.json" || nome === "arquitetura.json" || nome === "portfolio.json") {
    return regrasRelatorio(nome, r.data as RelatorioDimensao, contexto ?? null);
  }
  return [];
}

function regrasRelatorio(nome: string, rel: RelatorioDimensao, ctx: Contexto | null): string[] {
  const erros: string[] = [];
  const esperada = nome.replace(".json", "");
  if (rel.dimensao !== esperada) {
    erros.push(`dimensao: "${rel.dimensao}" não corresponde ao arquivo ${nome}`);
  }
  if (!ctx) return erros;
  if (rel.repo !== ctx.repo) erros.push(`repo: "${rel.repo}" difere de contexto.json ("${ctx.repo}")`);

  const ativos = ctx.achados_ativos.filter((a) => a.dimensao === rel.dimensao);
  const resolvidos = new Set(
    ctx.achados_resolvidos.filter((a) => a.dimensao === rel.dimensao).map((a) => a.id),
  );
  const conhecidos = new Set([...ativos.map((a) => a.id), ...resolvidos]);
  const vistos = new Set<string>();
  for (const [i, rec] of rel.reconciliacao.entries()) {
    if (!conhecidos.has(rec.id)) erros.push(`reconciliacao.${i}.id: "${rec.id}" não existe em contexto.json para ${rel.dimensao}`);
    if (vistos.has(rec.id)) erros.push(`reconciliacao.${i}.id: "${rec.id}" reconciliado duas vezes`);
    if (resolvidos.has(rec.id) && rec.veredito !== "regrediu") {
      erros.push(`reconciliacao.${i}: "${rec.id}" já estava resolvido; só reconcilie se regrediu`);
    }
    vistos.add(rec.id);
  }
  for (const a of ativos) {
    if (!vistos.has(a.id)) erros.push(`reconciliacao: achado ativo "${a.id}" (${a.titulo}) não foi reconciliado`);
  }
  return erros;
}
