import path from "node:path";
import os from "node:os";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type {
  AchadoExistente,
  Contexto,
  Dimensao,
  Execucao,
  RelatorioDimensao,
  StatusAchado,
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

function proximoNumero(db: Pick<Db, "select">, repo: string, dimensao: string): number {
  const prefixo = `${repo}-${dimensao}-`;
  const ids = db.select({ id: t.achados.id }).from(t.achados).where(like(t.achados.id, `${prefixo}%`)).all();
  return ids.reduce((max, { id }) => Math.max(max, numeroDoId(id)), 0) + 1;
}

export type ResultadoIngest = { novos: string[]; reconciliados: number; mudancas: number };

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

      for (const rec of rel.reconciliacao) {
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

      let n = proximoNumero(tx, repo, rel.dimensao);
      for (const novo of rel.achados_novos) {
        const id = `${repo}-${rel.dimensao}-${n++}`;
        tx.insert(t.achados)
          .values({
            id,
            repo,
            dimensao: rel.dimensao,
            tipo: novo.tipo,
            titulo: novo.titulo,
            evidencias_json: novo.evidencias,
            impacto: novo.impacto,
            esforco: novo.esforco,
            acao: novo.acao,
            status: "aberto",
            criado_run: runId,
            atualizado_run: runId,
          })
          .run();
        tx.insert(t.achadoEventos)
          .values({ achado_id: id, de: null, para: "aberto", origem: "agente", run_id: runId, em })
          .run();
        res.novos.push(id);
      }
    }
  });
  return res;
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
