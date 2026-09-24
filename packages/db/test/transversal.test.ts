import { beforeEach, describe, expect, it } from "vitest";
import type { Transversal } from "@mwdx/schema";
import {
  REPO_TRANSVERSAL,
  abrirDb,
  aplicarRelatorios,
  aplicarTransversal,
  type Db,
  finalizarRun,
  iniciarRun,
  mudarStatus,
  portfolio,
  quickWins,
  resumoTransversal,
  sincronizarRepos,
  tabelas,
} from "../src/index.ts";

const achado = (titulo: string) => ({
  tipo: "lacuna" as const,
  titulo,
  evidencias: [{ github: "a.topics", obs: "vazio" }],
  impacto: 3,
  esforco: 1,
  acao: "Criar um template de workflow de CI e aplicar nos repos",
});
const gh = (name: string) => ({
  name,
  isPrivate: false,
  isArchived: false,
  isEmpty: false,
  isFork: false,
  description: null,
  primaryLanguage: null,
  defaultBranchRef: { name: "main" },
  pushedAt: "2026-01-01T00:00:00Z",
});
const tr = (extra: Partial<Transversal> = {}): Transversal => ({
  reconciliacao: [],
  achados_novos: [],
  fixar_no_perfil: [],
  arquivar: [],
  ...extra,
});

let db: Db;
function runTransversal(id: string) {
  iniciarRun(db, { id, repo: REPO_TRANSVERSAL, head_sha: null, run_dir: `/tmp/${id}` });
}

beforeEach(() => {
  db = abrirDb(":memory:");
  sincronizarRepos(db, [gh("a"), gh("b")]);
  iniciarRun(db, { id: "a/1", repo: "a", head_sha: "h", run_dir: "/tmp/a1" });
  aplicarRelatorios(
    db,
    "a/1",
    "a",
    [{ repo: "a", dimensao: "higiene", nota: 30, justificativa: "j", reconciliacao: [], achados_novos: [achado("Sem CI")] }],
    { repo: "a", status: "ok", stack: "node", imagem: "node:22", comandos: [], observacoes: "" },
  );
  finalizarRun(db, "a/1", { status: "ok" });
});

describe("resumoTransversal", () => {
  it("resume cada repo com notas, stack e achados ativos", () => {
    const r = resumoTransversal(db);
    expect(r.repos.map((x) => [x.repo, x.stack, x.notas.higiene, x.achados_ativos.length, !!x.analisado_em])).toEqual([
      ["a", "node", 30, 1, true],
      ["b", null, undefined, 0, false],
    ]);
    expect(r.achados_transversais_ativos).toEqual([]);
  });
});

describe("aplicarTransversal", () => {
  it("cria achados com repos, grava recomendações e reconcilia no run seguinte", () => {
    runTransversal("_transversal/1");
    const r1 = aplicarTransversal(
      db,
      "_transversal/1",
      tr({
        achados_novos: [{ ...achado("CI ausente em vários repos"), repos: ["a", "b"] }, { ...achado("Outro"), repos: ["a"] }],
        fixar_no_perfil: [{ repo: "a", motivo: "melhor" }],
        arquivar: [{ repo: "b", motivo: "vazio" }],
      }),
    );
    expect(r1.novos).toEqual(["transversal-1", "transversal-2"]);
    expect(db.select().from(tabelas.recomendacoes).all()).toHaveLength(2);
    expect(() => aplicarTransversal(db, "_transversal/1", tr())).toThrow(/já foi ingerido/);

    mudarStatus(db, "transversal-2", "ignorado", "não quero");
    const resumo = resumoTransversal(db);
    expect(resumo.achados_transversais_ativos.map((a) => [a.id, a.repos])).toEqual([["transversal-1", ["a", "b"]]]);
    expect(resumo.transversais_ignorados).toEqual([{ id: "transversal-2", titulo: "Outro", motivo: "não quero" }]);

    runTransversal("_transversal/2");
    const r2 = aplicarTransversal(
      db,
      "_transversal/2",
      tr({ reconciliacao: [{ id: "transversal-1", veredito: "resolvido", evidencias: [{ github: "a.ci", obs: "tem CI" }] }] }),
    );
    expect(r2).toMatchObject({ reconciliados: 1, mudancas: 1, novos: [] });
    expect(resumoTransversal(db).achados_transversais_ativos).toEqual([]);
  });
});

describe("quickWins e portfolio", () => {
  it("quickWins traz ativos de impacto alto × esforço baixo (amplo: impacto > esforço ≤ 2), com a última execução", () => {
    iniciarRun(db, { id: "b/1", repo: "b", head_sha: "h", run_dir: "/tmp/b1" });
    aplicarRelatorios(
      db,
      "b/1",
      "b",
      [
        {
          repo: "b",
          dimensao: "portfolio",
          nota: 10,
          justificativa: "j",
          reconciliacao: [],
          achados_novos: [
            { ...achado("caro"), impacto: 3, esforco: 3 },
            { ...achado("médio"), impacto: 2, esforco: 1 },
            { ...achado("irrelevante"), impacto: 1, esforco: 1 },
          ],
        },
      ],
      null,
    );
    finalizarRun(db, "b/1", { status: "ok" });
    expect(quickWins(db).map((q) => [q.repo, q.achado.titulo, q.execucao?.stack ?? null])).toEqual([["a", "Sem CI", "node"]]);
    expect(quickWins(db, { amplo: true }).map((q) => [q.repo, q.achado.titulo])).toEqual([
      ["a", "Sem CI"],
      ["b", "médio"],
    ]);
  });

  it("portfolio mostra recomendações do último run ok e os achados transversais", () => {
    expect(portfolio(db)).toMatchObject({ ultimoRun: null, rodando: false, fixar: [], achados: [] });
    runTransversal("_transversal/1");
    aplicarTransversal(db, "_transversal/1", tr({ achados_novos: [{ ...achado("CI"), repos: ["a", "b"] }], fixar_no_perfil: [{ repo: "a", motivo: "m" }] }));
    finalizarRun(db, "_transversal/1", { status: "ok" });
    runTransversal("_transversal/2"); // em andamento: não apaga as recomendações do anterior
    const p = portfolio(db);
    expect(p).toMatchObject({ rodando: true, ultimoRun: { id: "_transversal/2" }, fixar: [{ repo: "a", privado: false }], arquivar: [] });
    expect(p.achados.map((a) => [a.id, a.repos])).toEqual([["transversal-1", ["a", "b"]]]);
  });
});
