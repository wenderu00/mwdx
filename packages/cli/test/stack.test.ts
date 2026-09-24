import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectarStack } from "../src/stack.ts";

function repo(arquivos: string[]): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mwdx-stack-"));
  for (const f of arquivos) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), "");
  }
  return dir;
}

describe("detectarStack", () => {
  it.each([
    [["package.json"], "node"],
    [["requirements.txt"], "python"],
    [["pom.xml"], "java"],
    [["src/Api/Api.csproj"], "dotnet"],
    [["GamingShop.sln", "GamingShop/GamingShop.csproj"], "dotnet"],
    [["frontend/package.json"], "node"],
    [["package.json", "scripts/requirements.txt"], "node"],
  ])("%j → %s", (arquivos, esperado) => {
    expect(detectarStack(repo(arquivos))?.stack).toBe(esperado);
  });

  it("devolve null sem stack reconhecida e ignora node_modules", () => {
    expect(detectarStack(repo(["README.md", "notas/diario.md"]))).toBeNull();
    expect(detectarStack(repo(["node_modules/x/package.json"]))).toBeNull();
  });
});
