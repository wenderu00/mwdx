import { describe, expect, it } from "vitest";
import { type Contexto, validarArquivoRun } from "../src/index.ts";

const achado = {
  tipo: "lacuna",
  titulo: "Sem CI",
  evidencias: [{ arquivo: ".github/", obs: "diretório ausente" }],
  impacto: 3,
  esforco: 1,
  acao: "Adicionar workflow GitHub Actions com npm ci e npm test",
};

const ctx: Contexto = {
  repo: "bioquest",
  head_sha: "abc",
  container: null,
  stack: "node",
  imagem: null,
  github: {},
  achados_ativos: [{ ...achado, id: "bioquest-higiene-1", dimensao: "higiene", status: "aberto" } as Contexto["achados_ativos"][0]],
  achados_resolvidos: [{ ...achado, titulo: "Sem README", id: "bioquest-higiene-2", dimensao: "higiene", status: "resolvido" } as Contexto["achados_resolvidos"][0]],
  ignorados: [],
};

const relatorio = (extra: object = {}) => ({
  repo: "bioquest",
  dimensao: "higiene",
  nota: 60,
  justificativa: "ok",
  reconciliacao: [
    { id: "bioquest-higiene-1", veredito: "persistente", evidencias: [{ arquivo: ".github/", obs: "ainda ausente" }] },
  ],
  achados_novos: [achado],
  ...extra,
});

describe("validarArquivoRun", () => {
  it("aceita relatório válido que reconcilia todos os ativos", () => {
    expect(validarArquivoRun("higiene.json", relatorio(), ctx)).toEqual([]);
  });

  it("rejeita achado sem evidência", () => {
    const erros = validarArquivoRun("higiene.json", relatorio({ achados_novos: [{ ...achado, evidencias: [] }] }), ctx);
    expect(erros.some((e) => e.startsWith("achados_novos.0.evidencias"))).toBe(true);
  });

  it("rejeita evidência que mistura formatos", () => {
    const erros = validarArquivoRun(
      "higiene.json",
      relatorio({ achados_novos: [{ ...achado, evidencias: [{ arquivo: "a", execucao: "b", obs: "c" }] }] }),
      ctx,
    );
    expect(erros).not.toEqual([]);
  });

  it("exige reconciliar achados ativos", () => {
    const erros = validarArquivoRun("higiene.json", relatorio({ reconciliacao: [] }), ctx);
    expect(erros).toContainEqual(expect.stringContaining("bioquest-higiene-1"));
  });

  it("rejeita id desconhecido e resolvido marcado como persistente", () => {
    const ev = [{ arquivo: "x", obs: "y" }];
    const erros = validarArquivoRun(
      "higiene.json",
      relatorio({
        reconciliacao: [
          { id: "bioquest-higiene-1", veredito: "resolvido", evidencias: ev },
          { id: "inventado", veredito: "persistente", evidencias: ev },
          { id: "bioquest-higiene-2", veredito: "persistente", evidencias: ev },
        ],
      }),
      ctx,
    );
    expect(erros).toHaveLength(2);
  });

  it("rejeita dimensão que não bate com o nome do arquivo", () => {
    expect(validarArquivoRun("arquitetura.json", relatorio(), null)).toHaveLength(1);
  });
});
