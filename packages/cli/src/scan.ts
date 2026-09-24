import { writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import type { Contexto } from "@mwdx/schema";
import {
  type Db,
  type RepoGithub,
  finalizarRun,
  historicoParaContexto,
  iniciarRun,
  obterRepo,
  sincronizarRepos,
  tabelas,
  ultimoHeadAnalisado,
} from "@mwdx/db";
import { rodarClaude } from "./claude.ts";
import { dirCache, garantirClone } from "./clone.ts";
import { headRemoto, listarRepos, metadadosExtras, normalizarGithub } from "./github.ts";
import { type Ingestao, ingerirRunDir } from "./ingest.ts";
import { carimbo, prepararRunDir } from "./run-dir.ts";
import { detectarStack } from "./stack.ts";

export type ResultadoScan =
  | { repo: string; pulado: string }
  | { repo: string; runId: string; runDir: string; status: string; custo_usd: number | null; ingestao: Ingestao | null; erro: string | null };

const RODANDO_VALIDO_MS = 60 * 60_000;

export async function scan(db: Db, repo: string, opts: { force?: boolean; log?: (m: string) => void } = {}): Promise<ResultadoScan> {
  const log = opts.log ?? (() => {});

  let linha = obterRepo(db, repo);
  if (!linha) {
    sincronizarRepos(db, await listarRepos());
    linha = obterRepo(db, repo);
    if (!linha) throw new Error(`repo "${repo}" não encontrado no GitHub`);
  }
  if (linha.vazio || !linha.branch_padrao) return { repo, pulado: "repositório vazio" };

  const emAndamento = db
    .select()
    .from(tabelas.runs)
    .where(and(eq(tabelas.runs.repo, repo), eq(tabelas.runs.status, "rodando")))
    .all()
    .find((r) => Date.now() - Date.parse(r.iniciado) < RODANDO_VALIDO_MS);
  if (emAndamento) return { repo, pulado: `já existe análise em andamento (${emAndamento.id})` };

  if (!opts.force) {
    const remoto = await headRemoto(repo, linha.branch_padrao);
    if (remoto === ultimoHeadAnalisado(db, repo)) return { repo, pulado: `sem commits novos desde a última análise (${remoto.slice(0, 7)})` };
  }

  log(`clonando/atualizando ${repo}`);
  const head = await garantirClone(repo);
  const stack = detectarStack(dirCache(repo));
  const github = normalizarGithub(linha.github_json as RepoGithub, await metadadosExtras(repo));

  const contexto: Contexto = {
    repo,
    head_sha: head,
    container: null, // fatia 3: container por stack
    stack: stack?.stack ?? null,
    imagem: stack?.imagem ?? null,
    github,
    ...historicoParaContexto(db, repo),
  };
  const ts = carimbo();
  const runId = `${repo}/${ts}`;
  const runDir = prepararRunDir({ codigo: dirCache(repo), contexto, ts });
  iniciarRun(db, { id: runId, repo, head_sha: head, run_dir: runDir });

  log(`analisando ${repo} (${runDir})`);
  const claude = await rodarClaude(`/mwdx:analisar-repo ${repo} ${runDir}`, runDir);
  writeFileSync(path.join(runDir, "claude-resultado.json"), JSON.stringify(claude, null, 2) + "\n");

  let ingestao: Ingestao | null = null;
  let erro = claude.erro;
  try {
    ingestao = ingerirRunDir(db, runDir, runId);
    if (ingestao.problemas.length) erro = [erro, ...ingestao.problemas].filter(Boolean).join("\n");
  } catch (e) {
    erro = [erro, (e as Error).message].filter(Boolean).join("\n");
  }
  const status = !ingestao ? "erro" : claude.ok ? ingestao.status : "parcial";
  finalizarRun(db, runId, { status, custo_usd: claude.custo_usd, duracao_s: claude.duracao_s, resumo: claude.texto || null, erro });

  return { repo, runId, runDir, status, custo_usd: claude.custo_usd, ingestao, erro };
}
