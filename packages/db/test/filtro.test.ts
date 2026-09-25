import { beforeEach, describe, expect, it } from "vitest";
import { abrirDb, type Db, definirSelecao, motivoFora, obterRepo, sincronizarRepos } from "../src/index.ts";

const AGORA = new Date("2026-09-24T00:00:00Z");

const repo = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  isPrivate: false,
  isArchived: false,
  isEmpty: false,
  isFork: false,
  description: null,
  primaryLanguage: { name: "TypeScript" },
  defaultBranchRef: { name: "main" },
  pushedAt: "2026-09-01T00:00:00Z",
  diskUsage: 100,
  ...extra,
});

let db: Db;
beforeEach(() => {
  db = abrirDb(":memory:");
  sincronizarRepos(db, [
    repo("ok"),
    repo("docs", { primaryLanguage: null }),
    repo("stub", { diskUsage: 3 }),
    repo("velho", { pushedAt: "2022-01-24T00:00:00Z" }),
    repo("fork", { isFork: true }),
  ]);
});

const motivo = (nome: string) => motivoFora(obterRepo(db, nome)!, AGORA);

describe("motivoFora", () => {
  it("aplica as regras automáticas", () => {
    expect(motivo("ok")).toBeNull();
    expect(motivo("docs")).toBe("sem linguagem (docs/notas)");
    expect(motivo("stub")).toBe("só 3 KB");
    expect(motivo("velho")).toBe("sem push desde 2022-01");
    expect(motivo("fork")).toBe("fork");
  });

  it("a escolha manual vale mais que as regras e sobrevive ao sync", () => {
    definirSelecao(db, "velho", "incluir");
    definirSelecao(db, "ok", "excluir", "tutorial");
    sincronizarRepos(db, [repo("ok"), repo("velho", { pushedAt: "2022-01-24T00:00:00Z" })]);
    expect(motivo("velho")).toBeNull();
    expect(motivo("ok")).toBe("excluído manualmente: tutorial");
    definirSelecao(db, "ok", null);
    expect(motivo("ok")).toBeNull();
    expect(obterRepo(db, "ok")!.selecao_motivo).toBeNull();
  });

  it("excluir exige motivo e repo existente", () => {
    expect(() => definirSelecao(db, "ok", "excluir", " ")).toThrow("excluir exige motivo");
    expect(() => definirSelecao(db, "nada", "incluir")).toThrow(/repo inexistente/);
  });
});
