import { chmodSync, cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Contexto } from "@mwdx/schema";
import { PLUGIN, mwdxHome } from "./caminhos.ts";

// Pastas pesadas e regeneráveis que não vale copiar para work/.
const IGNORAR = new Set(["node_modules", ".venv", "venv", ".next", "__pycache__", ".pytest_cache"]);

export function carimbo(data = new Date()): string {
  return data.toISOString().replace(/[:.]/g, "-");
}

// Monta um run dir autocontido: os agentes só recebem este caminho.
//   contexto.json  work/  perfil.md  regras-achados.md  schemas/  bin/exec-container.sh
export function prepararRunDir(opts: { codigo: string; contexto: Contexto; ts?: string }): string {
  const contexto = Contexto.parse(opts.contexto);
  const dir = path.join(mwdxHome(), "runs", contexto.repo, opts.ts ?? carimbo());
  mkdirSync(path.join(dir, "bin"), { recursive: true });

  cpSync(opts.codigo, path.join(dir, "work"), {
    recursive: true,
    filter: (origem) => !IGNORAR.has(path.basename(origem)),
  });
  cpSync(path.join(PLUGIN, "schemas"), path.join(dir, "schemas"), { recursive: true });
  cpSync(path.join(PLUGIN, "perfil.md"), path.join(dir, "perfil.md"));
  cpSync(path.join(PLUGIN, "regras-achados.md"), path.join(dir, "regras-achados.md"));
  const exec = path.join(dir, "bin", "exec-container.sh");
  cpSync(path.join(PLUGIN, "scripts", "exec-container.sh"), exec);
  chmodSync(exec, 0o755);

  writeFileSync(path.join(dir, "contexto.json"), JSON.stringify(contexto, null, 2) + "\n");
  return dir;
}
