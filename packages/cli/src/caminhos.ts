import os from "node:os";
import path from "node:path";

export const RAIZ_REPO = path.resolve(import.meta.dirname, "../../..");
export const PLUGIN = path.join(RAIZ_REPO, "plugin");

// Tudo que a plataforma grava fica fora do repo, em ~/.mwdx (MWDX_HOME para testes).
export function mwdxHome(): string {
  return process.env.MWDX_HOME ?? path.join(os.homedir(), ".mwdx");
}
