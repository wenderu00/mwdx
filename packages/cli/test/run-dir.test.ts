import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prepararRunDir } from "../src/run-dir.ts";

const contexto = {
  repo: "demo",
  head_sha: null,
  container: null,
  stack: null,
  imagem: null,
  github: {},
  achados_ativos: [],
  achados_resolvidos: [],
  ignorados: [],
};

let codigo: string;

beforeEach(() => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "mwdx-"));
  process.env.MWDX_HOME = path.join(tmp, "home");
  codigo = path.join(tmp, "codigo");
  mkdirSync(path.join(codigo, "src"), { recursive: true });
  mkdirSync(path.join(codigo, "node_modules", "pkg"), { recursive: true });
  writeFileSync(path.join(codigo, "src", "index.ts"), "export {};\n");
});

describe("prepararRunDir", () => {
  it("monta um run dir autocontido sem node_modules", () => {
    const dir = prepararRunDir({ codigo, contexto, ts: "t1" });

    expect(dir).toBe(path.join(process.env.MWDX_HOME!, "runs", "demo", "t1"));
    expect(existsSync(path.join(dir, "work", "src", "index.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "work", "node_modules"))).toBe(false);
    for (const f of ["perfil.md", "regras-achados.md", "schemas/higiene.schema.json"]) {
      expect(existsSync(path.join(dir, f))).toBe(true);
    }
    expect(statSync(path.join(dir, "bin", "exec-container.sh")).mode & 0o111).not.toBe(0);
    expect(JSON.parse(readFileSync(path.join(dir, "contexto.json"), "utf8")).repo).toBe("demo");
  });

  it("usa o perfil de MWDX_HOME quando existe, e o exemplo do plugin quando não", () => {
    const semPerfil = prepararRunDir({ codigo, contexto, ts: "t2" });
    expect(readFileSync(path.join(semPerfil, "perfil.md"), "utf8")).toContain("Este é um exemplo");

    writeFileSync(path.join(process.env.MWDX_HOME!, "perfil.md"), "# meu perfil\n");
    const comPerfil = prepararRunDir({ codigo, contexto, ts: "t3" });
    expect(readFileSync(path.join(comPerfil, "perfil.md"), "utf8")).toBe("# meu perfil\n");
  });

  it("recusa contexto inválido antes de copiar qualquer coisa", () => {
    expect(() => prepararRunDir({ codigo, contexto: { ...contexto, repo: "" } })).toThrow();
    expect(existsSync(path.join(process.env.MWDX_HOME!, "runs"))).toBe(false);
  });
});
