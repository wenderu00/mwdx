import { desc, eq, inArray } from "drizzle-orm";
import type { Dimensao, Evidencia, Execucao, StatusAchado } from "@mwdx/schema";
import { type Db, STATUS_ATIVOS } from "./index.ts";
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
    };
  });
}

export type RunDetalhe = Omit<LinhaRun, "execucao_json"> & { execucao: Execucao | null; notas: NotasPorDimensao };

export type AchadoDetalhe = {
  id: string;
  dimensao: Dimensao;
  tipo: "lacuna" | "oportunidade";
  titulo: string;
  evidencias: Evidencia[];
  impacto: number;
  esforco: number;
  acao: string;
  status: StatusAchado;
  criado_run: string;
  atualizado_run: string;
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

  const achados = db.select().from(t.achados).where(eq(t.achados.repo, nome)).all();
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

  const ordemStatus = (s: string) => (STATUS_ATIVOS as readonly string[]).includes(s) ? 0 : 1;
  return {
    repo,
    runs,
    achados: achados
      .map((a) => ({
        id: a.id,
        dimensao: a.dimensao as Dimensao,
        tipo: a.tipo,
        titulo: a.titulo,
        evidencias: a.evidencias_json as Evidencia[],
        impacto: a.impacto,
        esforco: a.esforco,
        acao: a.acao,
        status: a.status as StatusAchado,
        criado_run: a.criado_run,
        atualizado_run: a.atualizado_run,
        ultimoEvento: eventos.get(a.id) ?? null,
      }))
      // ativos primeiro; entre eles, maior impacto e menor esforço
      .sort((a, b) => ordemStatus(a.status) - ordemStatus(b.status) || b.impacto - a.impacto || a.esforco - b.esforco || a.id.localeCompare(b.id)),
  };
}
