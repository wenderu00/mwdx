import { existsSync, writeFileSync } from "node:fs";
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
import { derrubarContainer, garantirImagem, limparOrfaos, liberarAtivo, nomeContainer, registrarAtivo, subirContainer } from "./container.ts";
import { headRemoto, listarRepos, metadadosExtras, normalizarGithub } from "./github.ts";
import { type Ingestao, ingerirRunDir } from "./ingest.ts";
import { carimbo, prepararRunDir } from "./run-dir.ts";
import { sh } from "./sh.ts";
import { detectarStack } from "./stack.ts";

export type ResultadoScan =
  | { repo: string; pulado: string }
  | { repo: string; runId: string; runDir: string; status: string; custo_usd: number | null; ingestao: Ingestao | null; erro: string | null };

const RODANDO_VALIDO_MS = 60 * 60_000;

export type OpcoesScan = {
  force?: boolean;
  log?: (m: string) => void;
  // chamado quando o repo vai de fato ser analisado (depois do skip por HEAD);
  // devolve o motivo para não analisar, ou null. Usado pelo limite do `scan --all`.
  reservar?: () => string | null;
};

export async function scan(db: Db, repo: string, opts: OpcoesScan = {}): Promise<ResultadoScan> {
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

  await limparOrfaos().catch((e) => log(`aviso: limpeza de containers órfãos falhou: ${(e as Error).message}`));

  const recusa = opts.reservar?.();
  if (recusa) return { repo, pulado: recusa };

  log(`clonando/atualizando ${repo}`);
  const head = await garantirClone(repo);
  const stack = detectarStack(dirCache(repo));
  const github = normalizarGithub(linha.github_json as RepoGithub, await metadadosExtras(repo));

  // O nome é determinístico, então entra no contexto.json antes de o container
  // existir; ele sobe depois, montando o work/ que prepararRunDir acabou de copiar.
  const ts = carimbo();
  const container = stack ? nomeContainer(repo, ts) : null;
  const contexto: Contexto = {
    repo,
    head_sha: head,
    container,
    stack: stack?.stack ?? null,
    imagem: stack?.imagem ?? null,
    github,
    ...historicoParaContexto(db, repo),
  };
  const runId = `${repo}/${ts}`;
  const runDir = prepararRunDir({ codigo: dirCache(repo), contexto, ts });
  iniciarRun(db, { id: runId, repo, head_sha: head, run_dir: runDir });

  if (container) registrarAtivo(container);
  let claude: Awaited<ReturnType<typeof rodarClaude>>;
  try {
    const erroContainer = container ? await prepararContainer(container, contexto, runDir, log) : null;
    log(`analisando ${repo} (${runDir})`);
    claude = await rodarClaude(`/mwdx:analisar-repo ${repo} ${runDir}`, runDir);
    if (erroContainer) claude = { ...claude, erro: [erroContainer, claude.erro].filter(Boolean).join("\n") };
  } finally {
    if (container) {
      await derrubarContainer(container);
      liberarAtivo(container);
    }
  }
  writeFileSync(path.join(runDir, "claude-resultado.json"), JSON.stringify(claude, null, 2) + "\n");

  let ingestao: Ingestao | null = null;
  let erro = claude.erro;
  try {
    ingestao = ingerirRunDir(db, runDir, runId);
    if (ingestao.problemas.length) erro = [erro, ...ingestao.problemas].filter(Boolean).join("\n");
  } catch (e) {
    erro = [erro, (e as Error).message].filter(Boolean).join("\n");
  }
  await limparGerados(path.join(runDir, "work"));
  const status = !ingestao ? "erro" : claude.ok ? ingestao.status : "parcial";
  finalizarRun(db, runId, { status, custo_usd: claude.custo_usd, duracao_s: claude.duracao_s, resumo: claude.texto || null, erro });

  return { repo, runId, runDir, status, custo_usd: claude.custo_usd, ingestao, erro };
}

// Sobe o container; se falhar, a análise segue sem ele (o executor registra
// "sem_container") e o contexto.json é reescrito com container null.
async function prepararContainer(nome: string, contexto: Contexto, runDir: string, log: (m: string) => void): Promise<string | null> {
  try {
    log(`subindo container ${nome} (${contexto.imagem})`);
    await garantirImagem(contexto.imagem!);
    await subirContainer(nome, contexto.imagem!, path.join(runDir, "work"));
    return null;
  } catch (e) {
    await derrubarContainer(nome);
    contexto.container = null;
    writeFileSync(path.join(runDir, "contexto.json"), JSON.stringify(contexto, null, 2) + "\n");
    return `container não subiu: ${(e as Error).message}`;
  }
}

// Depois da análise, work/ só serve para conferir evidências: descarta o que o
// container gerou (dependências, builds), que ocupa a maior parte do disco.
async function limparGerados(work: string): Promise<void> {
  if (existsSync(path.join(work, ".git"))) await sh("git", ["-C", work, "clean", "-ffdxq"]).catch(() => {});
}
