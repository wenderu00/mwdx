import path from "node:path";
import os from "node:os";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  type AchadoExistente,
  type AchadoNovo,
  type Contexto,
  type Dimensao,
  type Evidencia,
  type Execucao,
  type RelatorioDimensao,
  Resumo,
  type StatusAchado,
  type Transversal,
} from "@mwdx/schema";
import * as t from "./tabelas.ts";

export * as tabelas from "./tabelas.ts";

export type Db = BetterSQLite3Database<typeof t>;

export function caminhoDbPadrao(): string {
  const home = process.env.MWDX_HOME ?? path.join(os.homedir(), ".mwdx");
  return path.join(home, "mwdx.db");
}

// `migracoes` existe para quem empacota este módulo (o dashboard no Next), onde
// import.meta.dirname não aponta mais para packages/db/src.
export function abrirDb(arquivo = caminhoDbPadrao(), migracoes = path.resolve(import.meta.dirname, "../drizzle")): Db {
  if (arquivo !== ":memory:") mkdirSync(path.dirname(arquivo), { recursive: true });
  const sqlite = new Database(arquivo);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema: t });
  migrate(db, { migrationsFolder: migracoes });
  return db;
}

const agora = () => new Date().toISOString();

// ---------- repos ----------

export type RepoGithub = {
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  isEmpty: boolean;
  isFork: boolean;
  description: string | null;
  primaryLanguage: { name: string } | null;
  defaultBranchRef: { name: string } | null;
  pushedAt: string | null;
  [campo: string]: unknown;
};

export function sincronizarRepos(db: Db, lista: RepoGithub[]): number {
  const em = agora();
  db.transaction((tx) => {
    for (const r of lista) {
      const linha = {
        nome: r.name,
        privado: r.isPrivate,
        arquivado: r.isArchived,
        vazio: r.isEmpty,
        linguagem: r.primaryLanguage?.name ?? null,
        descricao: r.description || null,
        branch_padrao: r.defaultBranchRef?.name ?? null,
        pushed_at: r.pushedAt,
        github_json: r,
        sincronizado_em: em,
      };
      tx.insert(t.repos).values(linha).onConflictDoUpdate({ target: t.repos.nome, set: linha }).run();
    }
  });
  return lista.length;
}

export function obterRepo(db: Db, nome: string) {
  return db.select().from(t.repos).where(eq(t.repos.nome, nome)).get();
}

// null volta o repo para as regras automáticas de filtro.ts.
export function definirSelecao(db: Db, nome: string, selecao: "incluir" | "excluir" | null, motivo?: string) {
  if (selecao === "excluir" && !motivo?.trim()) throw new Error("excluir exige motivo");
  if (!obterRepo(db, nome)) throw new Error(`repo inexistente: ${nome} (rode mwdx repos sync)`);
  db.update(t.repos)
    .set({ selecao, selecao_motivo: selecao ? motivo?.trim() || null : null })
    .where(eq(t.repos.nome, nome))
    .run();
}

export * from "./filtro.ts";

// ---------- runs ----------

export function iniciarRun(db: Db, run: { id: string; repo: string; head_sha: string | null; run_dir: string }) {
  db.insert(t.runs).values({ ...run, status: "rodando", iniciado: agora() }).run();
}

export function finalizarRun(
  db: Db,
  id: string,
  campos: Partial<Pick<typeof t.runs.$inferInsert, "status" | "custo_usd" | "duracao_s" | "resumo" | "erro" | "execucao_json">>,
) {
  db.update(t.runs).set({ ...campos, fim: agora() }).where(eq(t.runs.id, id)).run();
}

export function obterRun(db: Db, id: string) {
  return db.select().from(t.runs).where(eq(t.runs.id, id)).get();
}

// HEAD da última análise que produziu relatórios — base para pular repos sem commits novos.
export function ultimoHeadAnalisado(db: Db, repo: string): string | null {
  const r = db
    .select({ head: t.runs.head_sha })
    .from(t.runs)
    .where(and(eq(t.runs.repo, repo), inArray(t.runs.status, ["ok", "parcial"])))
    .orderBy(desc(t.runs.iniciado))
    .get();
  return r?.head ?? null;
}

// ---------- achados ----------

export const STATUS_ATIVOS = ["aberto", "em_andamento", "adiado", "regrediu"] as const satisfies StatusAchado[];

type LinhaAchado = typeof t.achados.$inferSelect;

function paraExistente(a: LinhaAchado): AchadoExistente {
  return {
    id: a.id,
    dimensao: a.dimensao as Dimensao,
    status: a.status as StatusAchado,
    tipo: a.tipo,
    titulo: a.titulo,
    evidencias: a.evidencias_json as AchadoExistente["evidencias"],
    impacto: a.impacto,
    esforco: a.esforco,
    acao: a.acao,
  };
}

// O que a próxima análise precisa saber do passado (vai para contexto.json).
export function historicoParaContexto(
  db: Db,
  repo: string,
): Pick<Contexto, "achados_ativos" | "achados_resolvidos" | "ignorados"> {
  const todos = db
    .select()
    .from(t.achados)
    .where(eq(t.achados.repo, repo))
    .all()
    .sort((a, b) => a.dimensao.localeCompare(b.dimensao) || numeroDoId(a.id) - numeroDoId(b.id));
  const ativos = new Set<string>(STATUS_ATIVOS);
  const motivos = new Map<string, string>();
  const ignorados = todos.filter((a) => a.status === "ignorado");
  if (ignorados.length) {
    const eventos = db
      .select()
      .from(t.achadoEventos)
      .where(and(inArray(t.achadoEventos.achado_id, ignorados.map((a) => a.id)), eq(t.achadoEventos.para, "ignorado")))
      .orderBy(t.achadoEventos.id)
      .all();
    for (const e of eventos) motivos.set(e.achado_id, e.motivo ?? "(sem motivo)");
  }
  return {
    achados_ativos: todos.filter((a) => ativos.has(a.status)).map(paraExistente),
    achados_resolvidos: todos.filter((a) => a.status === "resolvido").map(paraExistente),
    ignorados: ignorados.map((a) => ({
      id: a.id,
      dimensao: a.dimensao as Dimensao,
      titulo: a.titulo,
      motivo: motivos.get(a.id) ?? "(sem motivo)",
    })),
  };
}

const numeroDoId = (id: string) => Number(id.slice(id.lastIndexOf("-") + 1)) || 0;

function proximoNumero(db: Pick<Db, "select">, prefixo: string): number {
  const ids = db.select({ id: t.achados.id }).from(t.achados).where(like(t.achados.id, `${prefixo}%`)).all();
  return ids.reduce((max, { id }) => Math.max(max, numeroDoId(id)), 0) + 1;
}

export type ResultadoIngest = { novos: string[]; reconciliados: number; mudancas: number };

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Veredito = { id: string; veredito: "persistente" | "resolvido" | "regrediu"; evidencias: Evidencia[] };

function reconciliar(tx: Tx, runId: string, em: string, rec: Veredito, res: ResultadoIngest) {
  const atual = tx.select().from(t.achados).where(eq(t.achados.id, rec.id)).get();
  if (!atual) throw new Error(`reconciliação de achado inexistente: ${rec.id}`);
  // "persistente" mantém o status escolhido pelo usuário (em_andamento, adiado...)
  const para = rec.veredito === "persistente" ? atual.status : rec.veredito;
  tx.update(t.achados)
    .set({ status: para, evidencias_json: rec.evidencias, atualizado_run: runId })
    .where(eq(t.achados.id, rec.id))
    .run();
  res.reconciliados++;
  if (para !== atual.status) {
    res.mudancas++;
    tx.insert(t.achadoEventos)
      .values({ achado_id: rec.id, de: atual.status, para, origem: "agente", run_id: runId, em })
      .run();
  }
}

function criarAchados(
  tx: Tx,
  runId: string,
  em: string,
  alvo: { repo: string; dimensao: string; prefixo: string },
  novos: (AchadoNovo & { repos?: string[] })[],
  res: ResultadoIngest,
) {
  let n = proximoNumero(tx, alvo.prefixo);
  for (const { repos, ...novo } of novos) {
    const id = `${alvo.prefixo}${n++}`;
    tx.insert(t.achados)
      .values({
        id,
        repo: alvo.repo,
        dimensao: alvo.dimensao,
        tipo: novo.tipo,
        titulo: novo.titulo,
        evidencias_json: novo.evidencias,
        impacto: novo.impacto,
        esforco: novo.esforco,
        acao: novo.acao,
        status: "aberto",
        criado_run: runId,
        atualizado_run: runId,
        repos_json: repos ?? null,
      })
      .run();
    tx.insert(t.achadoEventos)
      .values({ achado_id: id, de: null, para: "aberto", origem: "agente", run_id: runId, em })
      .run();
    res.novos.push(id);
  }
}

// Aplica os relatórios de um run: notas, reconciliação dos achados existentes e
// criação dos novos com id estável. Tudo numa transação.
export function aplicarRelatorios(
  db: Db,
  runId: string,
  repo: string,
  relatorios: RelatorioDimensao[],
  execucao: Execucao | null,
): ResultadoIngest {
  const em = agora();
  const res: ResultadoIngest = { novos: [], reconciliados: 0, mudancas: 0 };

  db.transaction((tx) => {
    if (tx.select().from(t.notas).where(eq(t.notas.run_id, runId)).get()) {
      throw new Error(`run ${runId} já foi ingerido`);
    }
    if (execucao) tx.update(t.runs).set({ execucao_json: execucao }).where(eq(t.runs.id, runId)).run();

    for (const rel of relatorios) {
      tx.insert(t.notas)
        .values({ run_id: runId, dimensao: rel.dimensao, valor: rel.nota, justificativa: rel.justificativa })
        .run();
      for (const rec of rel.reconciliacao) reconciliar(tx, runId, em, rec, res);
      criarAchados(tx, runId, em, { repo, dimensao: rel.dimensao, prefixo: `${repo}-${rel.dimensao}-` }, rel.achados_novos, res);
    }
  });
  return res;
}

// ---------- visão transversal ----------

// Achados transversais ficam na mesma tabela, com repo e dimensão fixos e os
// repos envolvidos em repos_json.
export const REPO_TRANSVERSAL = "_transversal";
const PREFIXO_TRANSVERSAL = "transversal-";

export function aplicarTransversal(db: Db, runId: string, tr: Transversal): ResultadoIngest {
  const em = agora();
  const res: ResultadoIngest = { novos: [], reconciliados: 0, mudancas: 0 };
  db.transaction((tx) => {
    const jaIngerido =
      tx.select().from(t.recomendacoes).where(eq(t.recomendacoes.run_id, runId)).get() ??
      tx.select().from(t.achados).where(eq(t.achados.atualizado_run, runId)).get();
    if (jaIngerido) throw new Error(`run ${runId} já foi ingerido`);

    for (const rec of tr.reconciliacao) reconciliar(tx, runId, em, rec, res);
    criarAchados(tx, runId, em, { repo: REPO_TRANSVERSAL, dimensao: "transversal", prefixo: PREFIXO_TRANSVERSAL }, tr.achados_novos, res);
    for (const [tipo, lista] of [["fixar", tr.fixar_no_perfil], ["arquivar", tr.arquivar]] as const) {
      for (const r of lista) tx.insert(t.recomendacoes).values({ run_id: runId, tipo, repo: r.repo, motivo: r.motivo }).run();
    }
  });
  return res;
}

// Entrada do estrategista: o estado de todos os repos e dos achados transversais.
export function resumoTransversal(db: Db): Resumo {
  const repos = db.select().from(t.repos).orderBy(desc(t.repos.pushed_at)).all();
  const runs = db
    .select()
    .from(t.runs)
    .where(inArray(t.runs.status, ["ok", "parcial"]))
    .orderBy(desc(t.runs.iniciado))
    .all();
  const ultimo = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!ultimo.has(r.repo)) ultimo.set(r.repo, r);
  const notas = new Map<string, Record<string, number>>();
  const ids = [...ultimo.values()].map((r) => r.id);
  if (ids.length) {
    for (const n of db.select().from(t.notas).where(inArray(t.notas.run_id, ids)).all()) {
      notas.set(n.run_id, { ...notas.get(n.run_id), [n.dimensao]: n.valor });
    }
  }

  const transversal = historicoParaContexto(db, REPO_TRANSVERSAL);
  const linhasTransversais = new Map(
    db.select().from(t.achados).where(eq(t.achados.repo, REPO_TRANSVERSAL)).all().map((a) => [a.id, a]),
  );
  return Resumo.parse({
    gerado_em: agora(),
    repos: repos.map((repo) => {
      const run = ultimo.get(repo.nome);
      const h = historicoParaContexto(db, repo.nome);
      return {
        repo: repo.nome,
        github: repo.github_json as Record<string, unknown>,
        stack: (run?.execucao_json as Execucao | null)?.stack ?? null,
        analisado_em: run?.iniciado ?? null,
        notas: (run && notas.get(run.id)) ?? {},
        achados_ativos: h.achados_ativos.map(({ id, dimensao, tipo, titulo, impacto, esforco, status }) => ({
          id, dimensao, tipo, titulo, impacto, esforco, status,
        })),
        ignorados: h.ignorados,
      };
    }),
    achados_transversais_ativos: transversal.achados_ativos.map(({ dimensao: _, ...a }) => ({
      ...a,
      repos: (linhasTransversais.get(a.id)?.repos_json as string[] | null) ?? [],
    })),
    transversais_ignorados: transversal.ignorados.map(({ id, titulo, motivo }) => ({ id, titulo, motivo })),
  });
}

const STATUS_DO_USUARIO: StatusAchado[] = ["aberto", "em_andamento", "adiado", "ignorado", "resolvido"];

// Mudança manual (dashboard ou `mwdx achado`). Ignorar exige motivo: ele volta
// para o prompt dos especialistas como "não sugerir".
export function mudarStatus(db: Db, achadoId: string, para: StatusAchado, motivo?: string) {
  if (!STATUS_DO_USUARIO.includes(para)) throw new Error(`status inválido para mudança manual: ${para}`);
  if (para === "ignorado" && !motivo?.trim()) throw new Error("ignorar exige motivo");
  db.transaction((tx) => {
    const atual = tx.select().from(t.achados).where(eq(t.achados.id, achadoId)).get();
    if (!atual) throw new Error(`achado inexistente: ${achadoId}`);
    if (atual.status === para) return;
    tx.update(t.achados).set({ status: para }).where(eq(t.achados.id, achadoId)).run();
    tx.insert(t.achadoEventos)
      .values({ achado_id: achadoId, de: atual.status, para, origem: "usuario", motivo: motivo?.trim() || null, em: agora() })
      .run();
  });
}

export * from "./consultas.ts";
