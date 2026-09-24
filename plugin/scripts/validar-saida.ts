// Hook PostToolUse(Write|Edit): valida os JSON que os agentes gravam num run dir
// contra o schema de packages/schema. Exit 2 devolve os erros ao agente, que corrige.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { type Contexto, ehArquivoRun, validarArquivoRun } from "../../packages/schema/src/index.ts";
import { lerEntradaHook, ehRunDir } from "./hook-comum.ts";

const entrada = await lerEntradaHook();
const arquivo = entrada?.tool_input?.file_path;
if (!arquivo) process.exit(0);

const nome = path.basename(arquivo);
const dir = path.dirname(arquivo);
if (!ehArquivoRun(nome) || nome === "contexto.json" || !ehRunDir(dir)) process.exit(0);

let dados: unknown;
try {
  dados = JSON.parse(readFileSync(arquivo, "utf8"));
} catch (e) {
  falhar([`JSON inválido: ${(e as Error).message}`]);
}

const caminhoCtx = path.join(dir, "contexto.json");
const contexto = existsSync(caminhoCtx) ? (JSON.parse(readFileSync(caminhoCtx, "utf8")) as Contexto) : null;

const erros = validarArquivoRun(nome, dados, contexto);
if (erros.length) falhar(erros);

function falhar(erros: string[]): never {
  const schema = `plugin/schemas/${nome.replace(".json", ".schema.json")}`;
  process.stderr.write(
    `${nome} não passou na validação (schema em ${schema}). Corrija e grave de novo:\n` +
      erros.map((e) => `- ${e}`).join("\n") +
      "\n",
  );
  process.exit(2);
}
