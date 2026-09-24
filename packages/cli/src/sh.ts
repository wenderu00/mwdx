import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// Executa um comando sem shell (argumentos nunca são interpolados) e devolve stdout.
export async function sh(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<string> {
  try {
    const { stdout } = await execFileP(cmd, args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 120_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error(`${cmd} ${args.join(" ")} falhou: ${(err.stderr || err.message).trim().slice(0, 2000)}`);
  }
}
