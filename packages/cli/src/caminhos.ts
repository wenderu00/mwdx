import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const RAIZ_REPO = path.resolve(import.meta.dirname, "../../..");
export const PLUGIN = path.join(RAIZ_REPO, "plugin");

// Tudo que a plataforma grava fica fora do repo, em ~/.mwdx (MWDX_HOME para testes).
export function mwdxHome(): string {
  return process.env.MWDX_HOME ?? path.join(os.homedir(), ".mwdx");
}

// O perfil real é pessoal e fica em MWDX_HOME; o exemplo do repo é o padrão.
export function caminhoPerfil(): string {
  const real = path.join(mwdxHome(), "perfil.md");
  return existsSync(real) ? real : path.join(PLUGIN, "perfil.exemplo.md");
}
