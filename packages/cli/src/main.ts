import path from "node:path";
import { parseArgs } from "node:util";
import { StatusAchado } from "@mwdx/schema";
import { existsSync } from "node:fs";
import { REPO_TRANSVERSAL, abrirDb, definirSelecao, iniciarRun, mudarStatus, obterRun, sincronizarRepos, finalizarRun } from "@mwdx/db";
import { mwdxHome } from "./caminhos.ts";
import { listarRepos } from "./github.ts";
import { estrategia } from "./estrategia.ts";
import { ingerirRunDir, ingerirTransversal } from "./ingest.ts";
import { filaLote, foraDaFila, scanLote } from "./lote.ts";
import { prepararRunDir } from "./run-dir.ts";
import { scan } from "./scan.ts";

const USO = `uso:
  mwdx repos sync                          atualiza a lista de repos a partir do GitHub
  mwdx repos excluir <repo> --motivo m     tira o repo da fila do scan --all
  mwdx repos incluir <repo>                põe o repo na fila mesmo que as regras o tirem
  mwdx repos auto <repo>                   volta o repo para as regras automáticas
  mwdx scan <repo> [--force]               analisa um repo (pula se o HEAD não mudou)
  mwdx scan --all [--concorrencia 2] [--limite n] [--listar]
                                           analisa todos os repos ativos, dos mais recentes aos mais antigos
  mwdx estrategia                          visão transversal (padrões, fixar no perfil, arquivar)
  mwdx ingest <run_dir>                    (re)aplica no banco os relatórios de um run dir
  mwdx achado <id> <status> [--motivo m]   muda o status de um achado (ignorado exige motivo)
  mwdx preparar <repo> <caminho>           monta um run dir sem GitHub nem container (dev)`;

const [comando, ...resto] = process.argv.slice(2);

try {
  await executar();
} catch (e) {
  sair((e as Error).message);
}

async function executar() {
  switch (comando) {
    case "repos": {
      const { positionals, values } = parseArgs({ args: resto, allowPositionals: true, options: { motivo: { type: "string" } } });
      const [acao, repo] = positionals;
      if (acao === "sync") {
        const n = sincronizarRepos(abrirDb(), await listarRepos());
        console.log(`${n} repos sincronizados`);
        return;
      }
      const selecao = { excluir: "excluir", incluir: "incluir", auto: null } as const;
      if (!acao || !(acao in selecao) || !repo) sair(USO);
      definirSelecao(abrirDb(), repo, selecao[acao as keyof typeof selecao], values.motivo);
      console.log(`${repo} → ${acao}`);
      return;
    }
    case "scan": {
      const { positionals, values } = parseArgs({
        args: resto,
        allowPositionals: true,
        options: {
          force: { type: "boolean" },
          all: { type: "boolean" },
          concorrencia: { type: "string" },
          limite: { type: "string" },
          listar: { type: "boolean" },
        },
      });
      if (values.all) return scanTodos(values);
      if (!positionals[0]) sair(USO);
      imprimirScan(await scan(abrirDb(), positionals[0], { force: values.force, log: (m) => console.error(`· ${m}`) }));
      return;
    }
    case "estrategia": {
      const r = await estrategia(abrirDb(), { log: (m) => console.error(`· ${m}`) });
      console.log(`transversal: ${r.status} — run ${r.runId}`);
      if (r.ingestao) {
        const i = r.ingestao;
        console.log(`  ${i.novos.length} achados novos, ${i.reconciliados} reconciliados (${i.mudancas} mudaram de status)`);
        console.log(`  ${i.fixar} para fixar no perfil, ${i.arquivar} para arquivar`);
      }
      if (r.custo_usd != null) console.log(`  custo equivalente: US$ ${r.custo_usd.toFixed(2)}`);
      if (r.erro) console.log(`  problemas:\n${indentar(r.erro)}`);
      if (r.status === "erro") process.exitCode = 1;
      return;
    }
    case "ingest": {
      const runDir = path.resolve(resto[0] ?? sair(USO));
      const runId = path.relative(path.join(mwdxHome(), "runs"), runDir);
      const db = abrirDb();
      if (existsSync(path.join(runDir, "resumo.json"))) {
        if (!obterRun(db, runId)) iniciarRun(db, { id: runId, repo: REPO_TRANSVERSAL, head_sha: null, run_dir: runDir });
        const r = ingerirTransversal(db, runDir, runId);
        finalizarRun(db, runId, { status: "ok" });
        console.log(`${runId}: ok — ${r.novos.length} novos, ${r.reconciliados} reconciliados, ${r.fixar} fixar, ${r.arquivar} arquivar`);
        return;
      }
      // run dirs montados com `mwdx preparar` não têm linha em runs
      if (!obterRun(db, runId)) iniciarRun(db, { id: runId, repo: runId.split("/")[0]!, head_sha: null, run_dir: runDir });
      const r = ingerirRunDir(db, runDir, runId);
      finalizarRun(db, runId, { status: r.status, erro: r.problemas.join("\n") || null });
      console.log(`${runId}: ${r.status} — ${r.novos.length} novos, ${r.reconciliados} reconciliados`);
      if (r.problemas.length) console.log(`  problemas:\n${indentar(r.problemas.join("\n"))}`);
      return;
    }
    case "achado": {
      const { positionals, values } = parseArgs({ args: resto, allowPositionals: true, options: { motivo: { type: "string" } } });
      const [id, status] = positionals;
      if (!id || !status) sair(USO);
      mudarStatus(abrirDb(), id, StatusAchado.parse(status), values.motivo);
      console.log(`${id} → ${status}`);
      return;
    }
    case "preparar": {
      const [repo, codigo] = resto;
      if (!repo || !codigo) sair(USO);
      const dir = prepararRunDir({
        codigo: path.resolve(codigo),
        contexto: {
          repo,
          head_sha: null,
          container: null,
          stack: null,
          imagem: null,
          github: {},
          achados_ativos: [],
          achados_resolvidos: [],
          ignorados: [],
        },
      });
      console.log(dir);
      return;
    }
    default:
      sair(USO);
  }
}

async function scanTodos(values: { concorrencia?: string; limite?: string; listar?: boolean }) {
  const db = abrirDb();
  if (values.listar) {
    sincronizarRepos(db, await listarRepos());
    const fila = filaLote(db);
    const fora = foraDaFila(db);
    fila.forEach((r, i) => console.log(`${String(i + 1).padStart(3)}. ${r}`));
    console.log(`\nfora da fila:`);
    fora.forEach((r) => console.log(`     ${r.nome} — ${r.motivo}`));
    console.log(
      `\n${fila.length} repos na fila, ${fora.length} fora (regras em packages/db/src/filtro.ts; ajuste com mwdx repos excluir/incluir/auto); ` +
        `os já analisados no HEAD atual são pulados`,
    );
    return;
  }
  const inteiro = (v: string | undefined, nome: string) => {
    if (v == null) return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) sair(`--${nome} precisa ser um inteiro positivo`);
    return n;
  };
  const r = await scanLote(db, {
    concorrencia: inteiro(values.concorrencia, "concorrencia"),
    limite: inteiro(values.limite, "limite"),
    log: (m) => console.error(`· ${m}`),
  });
  const conta = (f: (x: (typeof r.resultados)[number]) => boolean) => r.resultados.filter(f).length;
  console.log(
    `lote: ${conta((x) => !("pulado" in x))} analisados, ${conta((x) => "pulado" in x)} pulados, ` +
      `${conta((x) => "status" in x && x.status === "erro")} com erro · custo equivalente US$ ${r.custo_usd.toFixed(2)}`,
  );
  if (r.interrompido) {
    console.log(`  interrompido: ${r.interrompido}. Rode de novo para continuar de onde parou.`);
    process.exitCode = 1;
  }
}

function imprimirScan(r: Awaited<ReturnType<typeof scan>>) {
  if ("pulado" in r) {
    console.log(`${r.repo}: pulado — ${r.pulado}`);
    return;
  }
  console.log(`${r.repo}: ${r.status} — run ${r.runId}`);
  if (r.ingestao) console.log(`  ${r.ingestao.novos.length} achados novos, ${r.ingestao.reconciliados} reconciliados (${r.ingestao.mudancas} mudaram de status)`);
  if (r.custo_usd != null) console.log(`  custo equivalente: US$ ${r.custo_usd.toFixed(2)}`);
  if (r.erro) console.log(`  problemas:\n${indentar(r.erro)}`);
  if (r.status === "erro") process.exitCode = 1;
}

function indentar(texto: string): string {
  return texto
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
}

function sair(msg: string): never {
  console.error(msg);
  process.exit(1);
}
