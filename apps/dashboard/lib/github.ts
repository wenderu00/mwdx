import "server-only";
import { execFileSync } from "node:child_process";

// Dono dos repos, para montar links do GitHub. Mesma regra da CLI:
// MWDX_OWNER ou o usuário autenticado no gh.
let dono: string | null | undefined;
export function donoGithub(): string | null {
  if (dono === undefined) {
    try {
      dono = process.env.MWDX_OWNER ?? execFileSync("gh", ["api", "user", "--jq", ".login"], { encoding: "utf8", timeout: 10_000 }).trim();
    } catch {
      dono = null;
    }
  }
  return dono;
}
