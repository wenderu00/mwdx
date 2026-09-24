import { beforeEach, describe, expect, it } from "vitest";
import type { RelatorioDimensao } from "@mwdx/schema";
import {
  abrirDb,
  aplicarRelatorios,
  type Db,
  detalheRepo,
  finalizarRun,
  iniciarRun,
  mudarStatus,
  painel,
  sincronizarRepos,
} from "../src/index.ts";

const achado = (titulo: string, impacto = 2) => ({
  tipo: "lacuna" as const,
  titulo,
  evidencias: [{ arquivo: "README.md", obs: "ausente" }],
  impacto,
  esforco: 1,
  acao: "Criar README com propósito, stack e como rodar",
});
const rel = (nota: number, extra: Partial<RelatorioDimensao> = {}): RelatorioDimensao => ({
  repo: "demo",
  dimensao: "higiene",
  nota,
  justificativa: `nota ${nota}`,
  reconciliacao: [],
  achados_novos: [],
  ...extra,
});
const repoGh = (name: string, pushedAt: string, isEmpty = false) => ({
  name,
  isPrivate: false,
  isArchived: false,
  isEmpty,
  isFork: false,
  description: null,
  primaryLanguage: { name: "TypeScript" },
  defaultBranchRef: { name: "main" },
  pushedAt,
});
const execucao = { repo: "demo", status: "ok" as const, stack: "node", imagem: "node:22", comandos: [], observacoes: "" };

let db: Db;
function runCompleto(id: string, relatorios: RelatorioDimensao[]) {
  iniciarRun(db, { id, repo: "demo", head_sha: "h", run_dir: `/tmp/${id}` });
  aplicarRelatorios(db, id, "demo", relatorios, execucao);
  finalizarRun(db, id, { status: "ok", custo_usd: 3 });
}

beforeEach(() => {
  db = abrirDb(":memory:");
  sincronizarRepos(db, [repoGh("demo", "2000-01-01T00:00:00Z"), repoGh("vazio", "2001-01-01T00:00:00Z", true), repoGh("outro", "1999-01-01T00:00:00Z")]);
});

describe("painel", () => {
  it("traz notas do último run com relatório e do anterior, ativos, stack e rodando", () => {
    runCompleto("demo/1", [rel(40, { achados_novos: [achado("a"), achado("b")] })]);
    runCompleto("demo/2", [rel(55)]);
    mudarStatus(db, "demo-higiene-1", "ignorado", "não se aplica");
    iniciarRun(db, { id: "demo/3", repo: "demo", head_sha: "h", run_dir: "/tmp/3" });

    const [demo, outro, ...resto] = painel(db);
    expect(resto).toEqual([]); // repo vazio fica de fora
    expect(demo).toMatchObject({
      nome: "demo",
      stack: "node",
      notas: { higiene: { valor: 55 } },
      notasAnteriores: { higiene: { valor: 40 } },
      ativos: 1,
      rodando: true,
      headMudou: false,
      ultimoRun: { id: "demo/3", status: "rodando" },
    });
    expect(outro).toMatchObject({ nome: "outro", ultimoRun: null, notas: {}, rodando: false });
  });

  it("marca headMudou quando houve push depois da última análise", () => {
    runCompleto("demo/1", [rel(40)]);
    sincronizarRepos(db, [repoGh("demo", "2999-01-01T00:00:00Z")]);
    expect(painel(db)[0]).toMatchObject({ nome: "demo", headMudou: true });
  });
});

describe("detalheRepo", () => {
  it("devolve runs com notas e achados ativos primeiro, com o motivo do último evento", () => {
    runCompleto("demo/1", [rel(40, { achados_novos: [achado("baixo", 1), achado("alto", 3)] })]);
    mudarStatus(db, "demo-higiene-2", "ignorado", "fora de escopo");

    const d = detalheRepo(db, "demo")!;
    expect(d.runs.map((r) => [r.id, r.notas.higiene?.valor, r.execucao?.stack])).toEqual([["demo/1", 40, "node"]]);
    expect(d.achados.map((a) => [a.id, a.status])).toEqual([
      ["demo-higiene-1", "aberto"],
      ["demo-higiene-2", "ignorado"],
    ]);
    expect(d.achados[1]!.ultimoEvento).toMatchObject({ origem: "usuario", motivo: "fora de escopo" });
    expect(detalheRepo(db, "nao-existe")).toBeNull();
  });
});
