import { beforeEach, describe, expect, it } from "vitest";
import type { RelatorioDimensao } from "@mwdx/schema";
import {
  abrirDb,
  aplicarRelatorios,
  type Db,
  historicoParaContexto,
  iniciarRun,
  mudarStatus,
  ultimoHeadAnalisado,
  finalizarRun,
  tabelas,
} from "../src/index.ts";

const ev = [{ arquivo: "README.md", obs: "ausente" }];
const achado = (titulo: string) => ({
  tipo: "lacuna" as const,
  titulo,
  evidencias: ev,
  impacto: 2,
  esforco: 1,
  acao: "Criar README com propósito, stack e como rodar",
});
const rel = (extra: Partial<RelatorioDimensao> = {}): RelatorioDimensao => ({
  repo: "demo",
  dimensao: "higiene",
  nota: 50,
  justificativa: "j",
  reconciliacao: [],
  achados_novos: [],
  ...extra,
});

let db: Db;
function run(id: string, head = "h1") {
  iniciarRun(db, { id, repo: "demo", head_sha: head, run_dir: `/tmp/${id}` });
}

beforeEach(() => {
  db = abrirDb(":memory:");
});

describe("aplicarRelatorios", () => {
  it("cria achados com ids sequenciais por dimensão e grava notas", () => {
    run("demo/1");
    const r = aplicarRelatorios(
      db,
      "demo/1",
      "demo",
      [rel({ achados_novos: [achado("a"), achado("b")] }), rel({ dimensao: "portfolio", achados_novos: [achado("c")] })],
      null,
    );
    expect(r.novos).toEqual(["demo-higiene-1", "demo-higiene-2", "demo-portfolio-1"]);
    expect(db.select().from(tabelas.notas).all()).toHaveLength(2);
  });

  it("reconcilia: resolvido muda status, persistente preserva o status do usuário", () => {
    run("demo/1");
    aplicarRelatorios(db, "demo/1", "demo", [rel({ achados_novos: [achado("a"), achado("b")] })], null);
    mudarStatus(db, "demo-higiene-2", "em_andamento");

    run("demo/2");
    const r = aplicarRelatorios(
      db,
      "demo/2",
      "demo",
      [
        rel({
          reconciliacao: [
            { id: "demo-higiene-1", veredito: "resolvido", evidencias: ev },
            { id: "demo-higiene-2", veredito: "persistente", evidencias: ev },
          ],
          achados_novos: [achado("c")],
        }),
      ],
      null,
    );
    expect(r).toEqual({ novos: ["demo-higiene-3"], reconciliados: 2, mudancas: 1 });
    const h = historicoParaContexto(db, "demo");
    expect(h.achados_ativos.map((a) => [a.id, a.status])).toEqual([
      ["demo-higiene-2", "em_andamento"],
      ["demo-higiene-3", "aberto"],
    ]);
    expect(h.achados_resolvidos.map((a) => a.id)).toEqual(["demo-higiene-1"]);
  });

  it("recusa ingerir o mesmo run duas vezes, sem efeito parcial", () => {
    run("demo/1");
    aplicarRelatorios(db, "demo/1", "demo", [rel({ achados_novos: [achado("a")] })], null);
    expect(() => aplicarRelatorios(db, "demo/1", "demo", [rel({ achados_novos: [achado("b")] })], null)).toThrow(
      /já foi ingerido/,
    );
    expect(db.select().from(tabelas.achados).all()).toHaveLength(1);
  });
});

describe("mudarStatus", () => {
  beforeEach(() => {
    run("demo/1");
    aplicarRelatorios(db, "demo/1", "demo", [rel({ achados_novos: [achado("a")] })], null);
  });

  it("ignorar exige motivo, e o motivo vai para o contexto", () => {
    expect(() => mudarStatus(db, "demo-higiene-1", "ignorado")).toThrow(/motivo/);
    mudarStatus(db, "demo-higiene-1", "ignorado", "repo de bootcamp, não vou manter");
    expect(historicoParaContexto(db, "demo").ignorados).toEqual([
      { id: "demo-higiene-1", dimensao: "higiene", titulo: "a", motivo: "repo de bootcamp, não vou manter" },
    ]);
  });

  it("não aceita 'regrediu' como mudança manual", () => {
    expect(() => mudarStatus(db, "demo-higiene-1", "regrediu")).toThrow();
  });
});

describe("ultimoHeadAnalisado", () => {
  it("considera só runs concluídos", () => {
    run("demo/1", "aaa");
    finalizarRun(db, "demo/1", { status: "ok" });
    run("demo/2", "bbb");
    finalizarRun(db, "demo/2", { status: "erro" });
    expect(ultimoHeadAnalisado(db, "demo")).toBe("aaa");
  });
});
