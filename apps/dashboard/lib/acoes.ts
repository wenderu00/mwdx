"use server";
import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { mudarStatus } from "@mwdx/db";
import type { StatusAchado } from "@mwdx/schema";
import { db } from "./db.ts";
import { RAIZ } from "./raiz.ts";

export type Resultado = { erro: string | null };

export async function mudarStatusAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const repo = String(form.get("repo"));
  try {
    mudarStatus(db(), String(form.get("id")), String(form.get("status")) as StatusAchado, String(form.get("motivo") ?? ""));
  } catch (e) {
    return { erro: (e as Error).message };
  }
  revalidatePath(`/repo/${repo}`);
  revalidatePath("/");
  return { erro: null };
}


// Dispara `mwdx scan <repo> --force` desacoplado do servidor; a página acompanha
// pelo run "rodando" no banco. A CLI recusa análise concorrente do mesmo repo.
export async function reanalisarAcao(repo: string): Promise<Resultado> {
  if (!/^[\w.-]+$/.test(repo)) return { erro: "nome de repo inválido" };
  const home = process.env.MWDX_HOME ?? path.join(os.homedir(), ".mwdx");
  const logs = path.join(home, "logs");
  mkdirSync(logs, { recursive: true });
  const arquivo = path.join(logs, `${repo}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
  const log = openSync(arquivo, "a");
  const filho = spawn(process.execPath, [path.join(RAIZ, "packages/cli/bin/mwdx.js"), "scan", repo, "--force"], {
    cwd: RAIZ,
    detached: true,
    stdio: ["ignore", log, log],
  });
  filho.unref();
  return { erro: null };
}
