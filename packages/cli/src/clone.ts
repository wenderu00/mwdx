import { existsSync } from "node:fs";
import path from "node:path";
import { mwdxHome } from "./caminhos.ts";
import { dono } from "./github.ts";
import { sh } from "./sh.ts";

export function dirCache(repo: string): string {
  return path.join(mwdxHome(), "cache", repo);
}

// Clone raso em ~/.mwdx/cache/<repo>; nas próximas vezes, atualiza para o HEAD
// remoto descartando qualquer resíduo local. Devolve o SHA do HEAD.
export async function garantirClone(repo: string): Promise<string> {
  const dir = dirCache(repo);
  if (!existsSync(path.join(dir, ".git"))) {
    await sh("gh", ["repo", "clone", `${await dono()}/${repo}`, dir, "--", "--depth", "1"], { timeoutMs: 600_000 });
  } else {
    await sh("git", ["-C", dir, "fetch", "--depth", "1", "origin", "HEAD"], { timeoutMs: 600_000 });
    await sh("git", ["-C", dir, "reset", "--hard", "FETCH_HEAD"]);
    await sh("git", ["-C", dir, "clean", "-fdx"]);
  }
  return sh("git", ["-C", dir, "rev-parse", "HEAD"]);
}
