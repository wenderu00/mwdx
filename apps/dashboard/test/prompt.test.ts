import { describe, expect, it } from "vitest";
import type { AchadoDetalhe } from "@mwdx/db";
import type { Execucao } from "@mwdx/schema";
import { promptCorrecao, semWork } from "../lib/prompt.ts";

const achado = (evidencias: AchadoDetalhe["evidencias"]): AchadoDetalhe => ({
  id: "demo-higiene-1",
  dimensao: "higiene",
  tipo: "lacuna",
  titulo: "Dependências com vulnerabilidade crítica",
  evidencias,
  impacto: 3,
  esforco: 1,
  acao: "Atualizar next para 15.5.26 ou superior",
  status: "aberto",
  criado_run: "demo/1",
  atualizado_run: "demo/1",
  repos: null,
  ultimoEvento: null,
});
const cmd = (etapa: Execucao["comandos"][number]["etapa"], comando: string) => ({ etapa, comando, exit_code: 0, duracao_s: 1, resumo: "r" });
const execucao: Execucao = {
  repo: "demo",
  status: "ok",
  stack: "node",
  imagem: "node:22",
  comandos: [cmd("install", "cd /work/app && npm ci"), cmd("build", "cd /work/app && npm run build"), cmd("test", "dotnet test /work/X.sln")],
  observacoes: "",
};

describe("semWork", () => {
  it("tira o /work do container", () => {
    expect(semWork("cd /work/app && npm ci")).toBe("cd app && npm ci");
    expect(semWork("dotnet build /work")).toBe("dotnet build .");
  });
});

describe("promptCorrecao", () => {
  it("usa os comandos citados nas evidências para verificar", () => {
    const p = promptCorrecao(
      "demo",
      achado([
        { execucao: "cd /work/app && npm audit --omit=dev", obs: "1 critical" },
        { arquivo: "app/package.json", linha: 12, obs: "next 15.5.1" },
        { github: "pushed_at", obs: "ativo" },
      ]),
      execucao,
    );
    expect(p).toContain("No repositório demo, resolva o achado demo-higiene-1 (higiene, lacuna)");
    expect(p).toContain("- app/package.json:12: next 15.5.1");
    expect(p).toContain("- GitHub (pushed_at): ativo");
    expect(p).toMatch(/verifique com:\n- `cd app && npm audit --omit=dev`$/);
  });

  it("sem comando nas evidências, cai no build/test registrados", () => {
    const p = promptCorrecao("demo", achado([{ arquivo: "README.md", obs: "ausente" }]), execucao);
    expect(p).toMatch(/verifique com:\n- `cd app && npm run build`\n- `dotnet test X.sln`$/);
    expect(promptCorrecao("demo", achado([{ arquivo: "README.md", obs: "ausente" }]), null)).toMatch(/confira as evidências/);
  });

  it("achado transversal cita os repos envolvidos", () => {
    const p = promptCorrecao("_transversal", { ...achado([{ github: "a.ci", obs: "sem CI" }]), id: "transversal-1", repos: ["a", "b"] }, null);
    expect(p.split("\n")[0]).toBe("Nos repositórios a, b, resolva o achado transversal transversal-1 (lacuna): Dependências com vulnerabilidade crítica");
  });
});
