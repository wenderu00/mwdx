import { existsSync } from "node:fs";
import path from "node:path";

type EntradaHook = { tool_input?: { file_path?: string } };

export async function lerEntradaHook(): Promise<EntradaHook | null> {
  let bruto = "";
  for await (const pedaco of process.stdin) bruto += pedaco;
  try {
    return JSON.parse(bruto) as EntradaHook;
  } catch {
    return null;
  }
}

// Um run dir é criado pela CLI e sempre tem contexto.json (análise de repo)
// ou resumo.json (análise transversal).
export function ehRunDir(dir: string): boolean {
  return existsSync(path.join(dir, "contexto.json")) || existsSync(path.join(dir, "resumo.json"));
}
