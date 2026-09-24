import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { abrirDb, historicoParaContexto, iniciarRun, type Db } from "@mwdx/db";
import type { Contexto } from "@mwdx/schema";
import { ingerirRunDir } from "../src/ingest.ts";
import { prepararRunDir } from "../src/run-dir.ts";

const ev = [{ arquivo: "README.md", obs: "ausente" }];
const achado = {
  tipo: "lacuna",
  titulo: "Sem README",
  evidencias: ev,
  impacto: 3,
  esforco: 1,
  acao: "Criar README com propósito, stack e como rodar",
};
const relatorio = (dimensao: string, extra = {}) => ({
  repo: "demo",
  dimensao,
  nota: 40,
  justificativa: "j",
  reconciliacao: [],
  achados_novos: [achado],
  ...extra,
});

let db: Db;
let codigo: string;

beforeEach(() => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "mwdx-ingest-"));
  process.env.MWDX_HOME = path.join(tmp, "home");
  codigo = path.join(tmp, "codigo");
  mkdirSync(codigo);
  db = abrirDb(":memory:");
});

function novoRun(ts: string, contexto: Partial<Contexto> = {}) {
  const dir = prepararRunDir({
    codigo,
    ts,
    contexto: {
      repo: "demo",
      head_sha: null,
      container: null,
      stack: null,
      imagem: null,
      github: {},
      achados_ativos: [],
      achados_resolvidos: [],
      ignorados: [],
      ...contexto,
    },
  });
  iniciarRun(db, { id: `demo/${ts}`, repo: "demo", head_sha: null, run_dir: dir });
  const gravar = (nome: string, dados: unknown) => writeFileSync(path.join(dir, nome), JSON.stringify(dados));
  return { dir, gravar };
}

describe("ingerirRunDir", () => {
  it("ingere o que é válido e marca parcial quando falta dimensão ou execução", () => {
    const { dir, gravar } = novoRun("t1");
    gravar("higiene.json", relatorio("higiene"));
    gravar("arquitetura.json", relatorio("arquitetura", { nota: 500 }));

    const r = ingerirRunDir(db, dir, "demo/t1");
    expect(r.status).toBe("parcial");
    expect(r.dimensoes).toEqual(["higiene"]);
    expect(r.novos).toEqual(["demo-higiene-1"]);
    expect(r.problemas).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^arquitetura\.json: nota/),
        "portfolio.json: ausente",
        "execucao.json: ausente",
      ]),
    );
  });

  it("segundo run reconcilia o primeiro usando o contexto gerado do banco", () => {
    const um = novoRun("t1");
    for (const d of ["higiene", "arquitetura", "portfolio"]) um.gravar(`${d}.json`, relatorio(d));
    um.gravar("execucao.json", { repo: "demo", status: "sem_stack", stack: null, imagem: null, comandos: [], observacoes: "" });
    expect(ingerirRunDir(db, um.dir, "demo/t1").status).toBe("ok");

    const dois = novoRun("t2", historicoParaContexto(db, "demo"));
    // esquecer de reconciliar um achado ativo invalida a dimensão inteira
    dois.gravar("higiene.json", relatorio("higiene", { achados_novos: [] }));
    dois.gravar(
      "portfolio.json",
      relatorio("portfolio", {
        achados_novos: [],
        reconciliacao: [{ id: "demo-portfolio-1", veredito: "resolvido", evidencias: [{ arquivo: "README.md", obs: "criado" }] }],
      }),
    );
    const r = ingerirRunDir(db, dois.dir, "demo/t2");
    expect(r.dimensoes).toEqual(["portfolio"]);
    expect(r.problemas).toContainEqual(expect.stringContaining('achado ativo "demo-higiene-1"'));
    expect(historicoParaContexto(db, "demo").achados_resolvidos.map((a) => a.id)).toEqual(["demo-portfolio-1"]);
  });
});
