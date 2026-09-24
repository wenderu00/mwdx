import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export type Stack = { stack: "node" | "dotnet" | "java" | "python"; imagem: string };

const IMAGENS: Record<Stack["stack"], string> = {
  node: "node:22",
  dotnet: "mcr.microsoft.com/dotnet/sdk:8.0",
  java: "maven:3-eclipse-temurin-21",
  python: "python:3.12",
};

const PULAR = new Set([".git", "node_modules", "bin", "obj", "dist", ".venv", "venv"]);

// Arquivos até `profundidade` níveis abaixo da raiz (projetos .NET/Java costumam
// ter a solução ou o build numa subpasta).
function arquivos(dir: string, profundidade: number): string[] {
  const saida: string[] = [];
  const visitar = (d: string, nivel: number) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (nivel < profundidade && !PULAR.has(e.name)) visitar(path.join(d, e.name), nivel + 1);
      } else saida.push(e.name);
    }
  };
  visitar(dir, 0);
  return saida;
}

// A primeira stack reconhecida vence; a raiz tem prioridade sobre subpastas.
export function detectarStack(dir: string): Stack | null {
  const raiz = (f: string) => existsSync(path.join(dir, f));
  const fundo = arquivos(dir, 2);
  const tem = (re: RegExp) => fundo.some((f) => re.test(f));

  let stack: Stack["stack"] | null = null;
  if (raiz("package.json")) stack = "node";
  else if (raiz("pyproject.toml") || raiz("requirements.txt") || raiz("setup.py")) stack = "python";
  else if (raiz("pom.xml") || raiz("build.gradle") || raiz("build.gradle.kts")) stack = "java";
  else if (tem(/\.(sln|csproj)$/)) stack = "dotnet";
  else if (tem(/^package\.json$/)) stack = "node";
  else if (tem(/^(pom\.xml|build\.gradle(\.kts)?)$/)) stack = "java";
  else if (tem(/^(pyproject\.toml|requirements\.txt|setup\.py)$/)) stack = "python";

  return stack ? { stack, imagem: IMAGENS[stack] } : null;
}
