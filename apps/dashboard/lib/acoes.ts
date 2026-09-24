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
  try {
    mudarStatus(db(), String(form.get("id")), String(form.get("status")) as StatusAchado, String(form.get("motivo") ?? ""));
  } catch (e) {
    return { erro: (e as Error).message };
  }
  // o mesmo achado aparece no repo, em quick-wins e no portfólio
  revalidatePath("/", "layout");
  return { erro: null };
}

// Dispara a CLI desacoplada do servidor; a página acompanha pelo run "rodando"
// no banco. A CLI recusa análise concorrente do mesmo alvo.
function dispararCli(args: string[], rotulo: string): Resultado {
  const home = process.env.MWDX_HOME ?? path.join(os.homedir(), ".mwdx");
  const logs = path.join(home, "logs");
  mkdirSync(logs, { recursive: true });
  const log = openSync(path.join(logs, `${rotulo}-${new Date().toISOString().replace(/[:.]/g, "-")}.log`), "a");
  spawn(process.execPath, [path.join(RAIZ, "packages/cli/bin/mwdx.js"), ...args], {
    cwd: RAIZ,
    detached: true,
    stdio: ["ignore", log, log],
  }).unref();
  return { erro: null };
}

export async function reanalisarAcao(repo: string): Promise<Resultado> {
  if (!/^[\w.-]+$/.test(repo)) return { erro: "nome de repo inválido" };
  return dispararCli(["scan", repo, "--force"], repo);
}

export async function estrategiaAcao(): Promise<Resultado> {
  return dispararCli(["estrategia"], "_transversal");
}
