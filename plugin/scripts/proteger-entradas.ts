// Hook PreToolUse(Write|Edit): contexto.json e resumo.json são escritos pela CLI e
// são a base da reconciliação — nenhum agente pode alterá-los.
import path from "node:path";
import { lerEntradaHook, ehRunDir } from "./hook-comum.ts";

const PROTEGIDOS = new Set(["contexto.json", "resumo.json"]);

const entrada = await lerEntradaHook();
const arquivo = entrada?.tool_input?.file_path;
if (arquivo && PROTEGIDOS.has(path.basename(arquivo)) && ehRunDir(path.dirname(arquivo))) {
  process.stderr.write(`${path.basename(arquivo)} é entrada da análise, escrita pela CLI mwdx — não altere.\n`);
  process.exit(2);
}
