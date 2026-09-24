import path from "node:path";
import { parseArgs } from "node:util";
import { StatusAchado } from "@mwdx/schema";
import { abrirDb, iniciarRun, mudarStatus, obterRun, sincronizarRepos, finalizarRun } from "@mwdx/db";
import { mwdxHome } from "./caminhos.ts";
import { listarRepos } from "./github.ts";
import { ingerirRunDir } from "./ingest.ts";
import { prepararRunDir } from "./run-dir.ts";
import { scan } from "./scan.ts";

const USO = `uso:
  mwdx repos sync                          atualiza a lista de repos a partir do GitHub
  mwdx scan <repo> [--force]               analisa um repo (pula se o HEAD não mudou)
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
      if (resto[0] !== "sync") sair(USO);
      const n = sincronizarRepos(abrirDb(), await listarRepos());
      console.log(`${n} repos sincronizados`);
      return;
    }
    case "scan": {
      const { positionals, values } = parseArgs({ args: resto, allowPositionals: true, options: { force: { type: "boolean" } } });
      if (!positionals[0]) sair(USO);
      const r = await scan(abrirDb(), positionals[0], { force: values.force, log: (m) => console.error(`· ${m}`) });
      if ("pulado" in r) {
        console.log(`${r.repo}: pulado — ${r.pulado}`);
        return;
      }
      console.log(`${r.repo}: ${r.status} — run ${r.runId}`);
      if (r.ingestao) console.log(`  ${r.ingestao.novos.length} achados novos, ${r.ingestao.reconciliados} reconciliados (${r.ingestao.mudancas} mudaram de status)`);
      if (r.custo_usd != null) console.log(`  custo equivalente: US$ ${r.custo_usd.toFixed(2)}`);
      if (r.erro) console.log(`  problemas:\n${indentar(r.erro)}`);
      if (r.status === "erro") process.exitCode = 1;
      return;
    }
    case "ingest": {
      const runDir = path.resolve(resto[0] ?? sair(USO));
      const runId = path.relative(path.join(mwdxHome(), "runs"), runDir);
      const db = abrirDb();
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
