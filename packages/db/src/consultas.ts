import { and, desc, eq, gt, inArray, lte, ne } from "drizzle-orm";
import type { Dimensao, Evidencia, Execucao, StatusAchado } from "@mwdx/schema";
import { type Db, REPO_TRANSVERSAL, STATUS_ATIVOS } from "./index.ts";
import { motivoFora } from "./filtro.ts";
import * as t from "./tabelas.ts";

// Leituras do dashboard. O volume é pequeno (dezenas de repos, centenas de runs),
// então carregar tudo e agrupar em memória é mais simples que SQL agregado.

type LinhaRun = typeof t.runs.$inferSelect;

export type Nota = { valor: number; justificativa: string };
export type NotasPorDimensao = Partial<Record<Dimensao, Nota>>;

export type ItemPainel = {
  nome: string;
  privado: boolean;
  arquivado: boolean;
  linguagem: string | null;
  descricao: string | null;
  pushed_at: string | null;
  stack: string | null;
  ultimoRun: { id: string; status: LinhaRun["status"]; iniciado: string; custo_usd: number | null } | null;
  notas: NotasPorDimensao;
  notasAnteriores: NotasPorDimensao;
  ativos: number;
  rodando: boolean;
  headMudou: boolean;
  selecao: "incluir" | "excluir" | null;
  foraDaFila: string | null; // motivo de ficar fora do `scan --all`
};

const COM_RELATORIO = new Set<LinhaRun["status"]>(["ok", "parcial"]);

function notasDosRuns(db: Db, runIds: string[]): Map<string, NotasPorDimensao> {
  const mapa = new Map<string, NotasPorDimensao>();
  if (!runIds.length) return mapa;
  for (const n of db.select().from(t.notas).where(inArray(t.notas.run_id, runIds)).all()) {
    const notas = mapa.get(n.run_id) ?? {};
    notas[n.dimensao as Dimensao] = { valor: n.valor, justificativa: n.justificativa };
    mapa.set(n.run_id, notas);
  }
  return mapa;
}

const stackDoRun = (r: LinhaRun | undefined) => (r?.execucao_json as Execucao | null)?.stack ?? null;

export function painel(db: Db): ItemPainel[] {
  const repos = db.select().from(t.repos).where(eq(t.repos.vazio, false)).orderBy(desc(t.repos.pushed_at)).all();
  const runsPorRepo = new Map<string, LinhaRun[]>();
  for (const r of db.select().from(t.runs).orderBy(desc(t.runs.iniciado)).all()) {
    runsPorRepo.set(r.repo, [...(runsPorRepo.get(r.repo) ?? []), r]);
  }
  const ativos = new Map<string, number>();
  for (const a of db.select({ repo: t.achados.repo }).from(t.achados).where(inArray(t.achados.status, STATUS_ATIVOS)).all()) {
    ativos.set(a.repo, (ativos.get(a.repo) ?? 0) + 1);
  }

  const analisados = [...runsPorRepo.values()].map((runs) => runs.filter((r) => COM_RELATORIO.has(r.status)).slice(0, 2));
  const notas = notasDosRuns(db, analisados.flat().map((r) => r.id));

  return repos.map((repo) => {
    const runs = runsPorRepo.get(repo.nome) ?? [];
    const [atual, anterior] = runs.filter((r) => COM_RELATORIO.has(r.status));
    const ultimo = runs[0];
    return {
      nome: repo.nome,
      privado: repo.privado,
      arquivado: repo.arquivado,
      linguagem: repo.linguagem,
      descricao: repo.descricao,
      pushed_at: repo.pushed_at,
      stack: stackDoRun(atual),
      ultimoRun: ultimo ? { id: ultimo.id, status: ultimo.status, iniciado: ultimo.iniciado, custo_usd: ultimo.custo_usd } : null,
      notas: (atual && notas.get(atual.id)) || {},
      notasAnteriores: (anterior && notas.get(anterior.id)) || {},
      ativos: ativos.get(repo.nome) ?? 0,
      rodando: runs.some((r) => r.status === "rodando"),
      headMudou: !!(atual && repo.pushed_at && repo.pushed_at > atual.iniciado),
      selecao: repo.selecao,
      foraDaFila: motivoFora(repo),
    };
  });
}

export type RunDetalhe = Omit<LinhaRun, "execucao_json"> & { execucao: Execucao | null; notas: NotasPorDimensao };

export type AchadoDetalhe = {
  id: string;
  dimensao: Dimensao | "transversal";
  tipo: "lacuna" | "oportunidade";
  titulo: string;
  evidencias: Evidencia[];
  impacto: number;
  esforco: number;
  acao: string;
  status: StatusAchado;
  criado_run: string;
  atualizado_run: string;
  repos: string[] | null; // só transversais
  // último evento: quem mudou para o status atual e por quê
  ultimoEvento: { origem: "agente" | "usuario"; motivo: string | null; em: string } | null;
};

export type DetalheRepo = {
  repo: typeof t.repos.$inferSelect;
  runs: RunDetalhe[]; // mais recente primeiro
  achados: AchadoDetalhe[];
};

export function detalheRepo(db: Db, nome: string): DetalheRepo | null {
  const repo = db.select().from(t.repos).where(eq(t.repos.nome, nome)).get();
  if (!repo) return null;

  const linhas = db.select().from(t.runs).where(eq(t.runs.repo, nome)).orderBy(desc(t.runs.iniciado)).all();
  const notas = notasDosRuns(db, linhas.map((r) => r.id));
  const runs = linhas.map(({ execucao_json, ...r }) => ({
    ...r,
    execucao: (execucao_json as Execucao | null) ?? null,
    notas: notas.get(r.id) ?? {},
  }));

  return { repo, runs, achados: detalharAchados(db, db.select().from(t.achados).where(eq(t.achados.repo, nome)).all()) };
}

const ordemStatus = (s: string) => ((STATUS_ATIVOS as readonly string[]).includes(s) ? 0 : 1);

// Ativos primeiro; entre eles, maior impacto e menor esforço.
function detalharAchados(db: Db, achados: (typeof t.achados.$inferSelect)[]): AchadoDetalhe[] {
  const eventos = new Map<string, AchadoDetalhe["ultimoEvento"]>();
  if (achados.length) {
    const lista = db
      .select()
      .from(t.achadoEventos)
      .where(inArray(t.achadoEventos.achado_id, achados.map((a) => a.id)))
      .orderBy(t.achadoEventos.id)
      .all();
    for (const e of lista) eventos.set(e.achado_id, { origem: e.origem, motivo: e.motivo, em: e.em });
  }
  return achados
    .map((a) => ({
      id: a.id,
      dimensao: a.dimensao as AchadoDetalhe["dimensao"],
      tipo: a.tipo,
      titulo: a.titulo,
      evidencias: a.evidencias_json as Evidencia[],
      impacto: a.impacto,
      esforco: a.esforco,
      acao: a.acao,
      status: a.status as StatusAchado,
      criado_run: a.criado_run,
      atualizado_run: a.atualizado_run,
      repos: (a.repos_json as string[] | null) ?? null,
      ultimoEvento: eventos.get(a.id) ?? null,
    }))
    .sort((a, b) => ordemStatus(a.status) - ordemStatus(b.status) || b.impacto - a.impacto || a.esforco - b.esforco || a.id.localeCompare(b.id));
}

function ultimaExecucao(db: Db, repo: string): Execucao | null {
  const r = db
    .select({ execucao: t.runs.execucao_json })
    .from(t.runs)
    .where(and(eq(t.runs.repo, repo), inArray(t.runs.status, ["ok", "parcial"])))
    .orderBy(desc(t.runs.iniciado))
    .all()
    .find((x) => x.execucao);
  return (r?.execucao as Execucao | undefined) ?? null;
}

export type QuickWin = { repo: string; achado: AchadoDetalhe; execucao: Execucao | null };

// Achados ativos de impacto alto e esforço baixo em todos os repos. `amplo`
// inclui também impacto alto × esforço médio e impacto médio × esforço baixo.
export function quickWins(db: Db, opts: { amplo?: boolean } = {}): QuickWin[] {
  const linhas = db
    .select()
    .from(t.achados)
    .where(
      and(
        ne(t.achados.repo, REPO_TRANSVERSAL),
        inArray(t.achados.status, STATUS_ATIVOS),
        opts.amplo ? and(gt(t.achados.impacto, t.achados.esforco), lte(t.achados.esforco, 2)) : and(eq(t.achados.impacto, 3), eq(t.achados.esforco, 1)),
      ),
    )
    .all();
  const repoDe = new Map(linhas.map((a) => [a.id, a.repo]));
  const execucoes = new Map<string, Execucao | null>();
  return detalharAchados(db, linhas).map((achado) => {
    const repo = repoDe.get(achado.id)!;
    if (!execucoes.has(repo)) execucoes.set(repo, ultimaExecucao(db, repo));
    return { repo, achado, execucao: execucoes.get(repo)! };
  });
}

export type Recomendacao = { repo: string; motivo: string; privado: boolean | null; arquivado: boolean | null };

export type Portfolio = {
  ultimoRun: Pick<typeof t.runs.$inferSelect, "id" | "status" | "iniciado" | "custo_usd" | "erro"> | null;
  rodando: boolean;
  fixar: Recomendacao[];
  arquivar: Recomendacao[];
  achados: AchadoDetalhe[];
};

export function portfolio(db: Db): Portfolio {
  const runs = db.select().from(t.runs).where(eq(t.runs.repo, REPO_TRANSVERSAL)).orderBy(desc(t.runs.iniciado)).all();
  const ultimoOk = runs.find((r) => r.status === "ok");
  const repos = new Map(db.select().from(t.repos).all().map((r) => [r.nome, r]));
  const recs = ultimoOk ? db.select().from(t.recomendacoes).where(eq(t.recomendacoes.run_id, ultimoOk.id)).all() : [];
  const rec = (tipo: "fixar" | "arquivar") =>
    recs
      .filter((r) => r.tipo === tipo)
      .map((r) => ({ repo: r.repo, motivo: r.motivo, privado: repos.get(r.repo)?.privado ?? null, arquivado: repos.get(r.repo)?.arquivado ?? null }));
  const ultimo = runs[0];
  return {
    ultimoRun: ultimo ? { id: ultimo.id, status: ultimo.status, iniciado: ultimo.iniciado, custo_usd: ultimo.custo_usd, erro: ultimo.erro } : null,
    rodando: runs.some((r) => r.status === "rodando"),
    fixar: rec("fixar"),
    arquivar: rec("arquivar"),
    achados: detalharAchados(db, db.select().from(t.achados).where(eq(t.achados.repo, REPO_TRANSVERSAL)).all()),
  };
}
