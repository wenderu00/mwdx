import { writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { type Db, REPO_TRANSVERSAL, finalizarRun, iniciarRun, resumoTransversal, tabelas } from "@mwdx/db";
import { rodarClaude } from "./claude.ts";
import { type IngestaoTransversal, ingerirTransversal } from "./ingest.ts";
import { carimbo, prepararRunDirTransversal } from "./run-dir.ts";

export type ResultadoEstrategia = {
  runId: string;
  runDir: string;
  status: "ok" | "erro";
  custo_usd: number | null;
  ingestao: IngestaoTransversal | null;
  erro: string | null;
};

export async function estrategia(db: Db, opts: { log?: (m: string) => void } = {}): Promise<ResultadoEstrategia> {
  const log = opts.log ?? (() => {});
  const emAndamento = db
    .select()
    .from(tabelas.runs)
    .where(and(eq(tabelas.runs.repo, REPO_TRANSVERSAL), eq(tabelas.runs.status, "rodando")))
    .all()
    .find((r) => Date.now() - Date.parse(r.iniciado) < 60 * 60_000);
  if (emAndamento) throw new Error(`já existe visão transversal em andamento (${emAndamento.id})`);

  const resumo = resumoTransversal(db);
  const analisados = resumo.repos.filter((r) => r.analisado_em).length;
  if (analisados < 2) throw new Error(`a visão transversal precisa de pelo menos 2 repos analisados (há ${analisados}); rode mwdx scan antes`);

  const ts = carimbo();
  const runId = `${REPO_TRANSVERSAL}/${ts}`;
  const runDir = prepararRunDirTransversal({ resumo, repo: REPO_TRANSVERSAL, ts });
  iniciarRun(db, { id: runId, repo: REPO_TRANSVERSAL, head_sha: null, run_dir: runDir });

  log(`visão transversal de ${resumo.repos.length} repos (${analisados} analisados) em ${runDir}`);
  const claude = await rodarClaude(`/mwdx:estrategia ${runDir}`, runDir);
  writeFileSync(path.join(runDir, "claude-resultado.json"), JSON.stringify(claude, null, 2) + "\n");

  let ingestao: IngestaoTransversal | null = null;
  let erro = claude.erro;
  try {
    ingestao = ingerirTransversal(db, runDir, runId);
  } catch (e) {
    erro = [erro, (e as Error).message].filter(Boolean).join("\n");
  }
  const status = ingestao ? "ok" : "erro";
  finalizarRun(db, runId, { status, custo_usd: claude.custo_usd, duracao_s: claude.duracao_s, resumo: claude.texto || null, erro });
  return { runId, runDir, status, custo_usd: claude.custo_usd, ingestao, erro };
}
