import path from "node:path";
import { parseArgs } from "node:util";
import { prepararRunDir } from "./run-dir.ts";

const USO = `uso:
  mwdx preparar <repo> <caminho-do-codigo>   monta um run dir sem GitHub nem container (dev)`;

const [comando, ...resto] = process.argv.slice(2);

switch (comando) {
  case "preparar": {
    const { positionals } = parseArgs({ args: resto, allowPositionals: true });
    const [repo, codigo] = positionals;
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
    break;
  }
  default:
    sair(USO);
}

function sair(msg: string): never {
  console.error(msg);
  process.exit(1);
}
