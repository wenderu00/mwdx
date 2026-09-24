import { describe, expect, it } from "vitest";
import { type Contexto, type Resumo, validarArquivoRun } from "../src/index.ts";

const achado = {
  tipo: "lacuna" as const,
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

describe("validarArquivoRun: transversal.json", () => {
  const resumo: Resumo = {
    gerado_em: "2026-09-24T00:00:00Z",
    repos: ["tilapia", "bioquest", "velho"].map((repo) => ({
      repo,
      github: {},
      stack: "node",
      analisado_em: null,
      notas: {},
      achados_ativos: [],
      ignorados: [],
    })),
    achados_transversais_ativos: [{ ...achado, id: "transversal-1", status: "aberto", repos: ["tilapia", "bioquest"] }],
    transversais_ignorados: [],
  };
  const transversal = (extra: object = {}) => ({
    reconciliacao: [{ id: "transversal-1", veredito: "persistente", evidencias: [{ github: "tilapia.topics", obs: "vazio" }] }],
    achados_novos: [{ ...achado, repos: ["tilapia", "bioquest"] }],
    fixar_no_perfil: [{ repo: "tilapia", motivo: "melhor exemplo" }],
    arquivar: [{ repo: "velho", motivo: "sem código próprio" }],
    ...extra,
  });

  it("aceita transversal que reconcilia os ativos e cita repos existentes", () => {
    expect(validarArquivoRun("transversal.json", transversal(), null, resumo)).toEqual([]);
  });

  it("rejeita repo inexistente, conflito fixar/arquivar e ativo sem reconciliação", () => {
    const erros = validarArquivoRun(
      "transversal.json",
      transversal({
        reconciliacao: [],
        achados_novos: [{ ...achado, repos: ["fantasma"] }],
        arquivar: [{ repo: "tilapia", motivo: "x" }],
      }),
      null,
      resumo,
    );
    expect(erros).toEqual([
      'achados_novos.0.repos.0: repo "fantasma" não existe em resumo.json',
      'arquivar.0: "tilapia" também está em fixar_no_perfil',
      'reconciliacao: achado transversal ativo "transversal-1" (Sem CI) não foi reconciliado',
    ]);
  });

  it("não aceita veredito regrediu", () => {
    const erros = validarArquivoRun(
      "transversal.json",
      transversal({ reconciliacao: [{ id: "transversal-1", veredito: "regrediu", evidencias: [{ github: "x", obs: "y" }] }] }),
      null,
      resumo,
    );
    expect(erros.some((e) => e.startsWith("reconciliacao.0.veredito"))).toBe(true);
  });
});
