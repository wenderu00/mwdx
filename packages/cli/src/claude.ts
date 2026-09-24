import { spawn } from "node:child_process";
import path from "node:path";
import { PLUGIN } from "./caminhos.ts";

export type ResultadoClaude = {
  ok: boolean;
  texto: string;
  custo_usd: number | null;
  duracao_s: number;
  erro: string | null;
};

// Ferramentas que a sessão headless pode usar: leitura livre, escrita só dentro
// do run dir e Bash só pelo wrapper do container.
export function ferramentasPermitidas(runDir: string): string[] {
  const abs = path.resolve(runDir);
  return [
    "Read",
    "Grep",
    "Glob",
    "Agent",
    `Edit(/${abs}/**)`,
    `Write(/${abs}/**)`,
    `Bash(${abs}/bin/exec-container.sh:*)`,
  ];
}

// Roda `claude -p` isolado das configurações globais do usuário (plugins, MCPs,
// hooks) — só o plugin mwdx é carregado.
export function rodarClaude(prompt: string, runDir: string, timeoutMs = 45 * 60_000): Promise<ResultadoClaude> {
  const args = [
    "-p",
    prompt,
    "--plugin-dir",
    PLUGIN,
    "--output-format",
    "json",
    "--setting-sources",
    "project",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--allowedTools",
    ...ferramentasPermitidas(runDir),
  ];
  const inicio = Date.now();
  return new Promise((resolve) => {
    const filho = spawn(process.env.MWDX_CLAUDE_BIN ?? "claude", args, {
      cwd: runDir,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    });
    let stdout = "";
    let stderr = "";
    filho.stdout.on("data", (d) => (stdout += d));
    filho.stderr.on("data", (d) => (stderr += d));
    filho.on("error", (e) => fim(null, e.message));
    filho.on("close", (codigo, sinal) => fim(codigo, sinal ? `encerrado por ${sinal} (timeout?)` : null));

    let resolvido = false;
    function fim(codigo: number | null, erroProc: string | null) {
      if (resolvido) return;
      resolvido = true;
      const duracao_s = (Date.now() - inicio) / 1000;
      let saida: { result?: string; is_error?: boolean; total_cost_usd?: number } = {};
      try {
        saida = JSON.parse(stdout);
      } catch {
        // stdout vazio ou truncado: o erro vem de stderr/erroProc
      }
      const erro =
        erroProc ??
        (codigo !== 0 || saida.is_error ? (saida.result ?? stderr.trim()) || `claude saiu com código ${codigo}` : null);
      resolve({
        ok: erro === null,
        texto: saida.result ?? "",
        custo_usd: saida.total_cost_usd ?? null,
        duracao_s,
        erro: erro?.slice(0, 4000) ?? null,
      });
    }
  });
}
