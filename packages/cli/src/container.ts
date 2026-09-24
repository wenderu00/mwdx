import { execFileSync } from "node:child_process";
import os from "node:os";
import { sh } from "./sh.ts";

const ORFAO_MS = 60 * 60_000;

// O prefixo `mwdx-` é o único que plugin/scripts/exec-container.sh aceita.
export function nomeContainer(repo: string, ts: string): string {
  return `mwdx-${repo}-${ts}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

export async function garantirImagem(imagem: string): Promise<void> {
  try {
    await sh("docker", ["image", "inspect", imagem]);
  } catch {
    await sh("docker", ["pull", imagem], { timeoutMs: 30 * 60_000 });
  }
}

// Roda com o usuário local para não deixar arquivos de root em work/; HOME em
// /tmp porque o uid não existe na imagem e npm/pip/dotnet precisam de um HOME gravável.
export async function subirContainer(nome: string, imagem: string, workDir: string): Promise<void> {
  const { uid, gid } = os.userInfo();
  await sh("docker", [
    "run", "-d",
    "--name", nome,
    "--label", `mwdx.inicio=${Date.now()}`,
    "--memory", "4g", "--cpus", "2",
    "--user", `${uid}:${gid}`,
    "-e", "HOME=/tmp", "-e", "DOTNET_CLI_HOME=/tmp", "-e", "npm_config_cache=/tmp/.npm",
    "-v", `${workDir}:/work`, "-w", "/work",
    imagem, "sleep", "infinity",
  ]);
}

export async function derrubarContainer(nome: string): Promise<void> {
  await sh("docker", ["rm", "-f", nome]).catch(() => {});
}

// Síncrono para poder rodar num handler de SIGINT.
export function derrubarContainerSync(nome: string): void {
  try {
    execFileSync("docker", ["rm", "-f", nome], { stdio: "ignore" });
  } catch {}
}

// Linhas "<nome> <mwdx.inicio>" de `docker ps` → nomes com mais de `maxIdadeMs`.
// Sem o label (container de fora do mwdx ou corrompido), não mexe.
export function orfaos(saida: string, agora: number, maxIdadeMs = ORFAO_MS): string[] {
  return saida
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter(([nome, inicio]) => nome?.startsWith("mwdx-") && /^\d+$/.test(inicio ?? "") && agora - Number(inicio) > maxIdadeMs)
    .map(([nome]) => nome!);
}

export async function limparOrfaos(): Promise<string[]> {
  const saida = await sh("docker", ["ps", "-a", "--filter", "name=^mwdx-", "--format", '{{.Names}} {{.Label "mwdx.inicio"}}']);
  const nomes = orfaos(saida, Date.now());
  for (const n of nomes) await derrubarContainer(n);
  return nomes;
}
