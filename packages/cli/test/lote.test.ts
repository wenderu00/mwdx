import { beforeEach, describe, expect, it, vi } from "vitest";
import { abrirDb, type Db, definirSelecao } from "@mwdx/db";

const repos = [
  { name: "novo", pushedAt: "2026-09-01T00:00:00Z" },
  { name: "medio", pushedAt: "2026-06-01T00:00:00Z" },
  { name: "velho", pushedAt: "2025-01-01T00:00:00Z" },
  { name: "vazio", pushedAt: "2026-09-02T00:00:00Z", isEmpty: true },
  { name: "arquivado", pushedAt: "2026-09-03T00:00:00Z", isArchived: true },
  { name: "fork", pushedAt: "2026-09-04T00:00:00Z", isFork: true },
  { name: "notas", pushedAt: "2026-09-05T00:00:00Z", primaryLanguage: null },
  { name: "stub", pushedAt: "2026-09-06T00:00:00Z", diskUsage: 2 },
  { name: "bootcamp", pushedAt: "2021-12-27T00:00:00Z" },
].map((r) => ({
  isPrivate: false,
  isArchived: false,
  isEmpty: false,
  isFork: false,
  description: null,
  primaryLanguage: { name: "TypeScript" },
  diskUsage: 100,
  defaultBranchRef: { name: "main" },
  ...r,
}));

vi.mock("../src/github.ts", () => ({ listarRepos: async () => repos }));

// scan falso: "medio" já foi analisado no HEAD atual; os outros custam US$ 1.
const chamados: string[] = [];
let erroDe: Record<string, string> = {};
vi.mock("../src/scan.ts", () => ({
  scan: async (_db: unknown, repo: string, opts: { reservar?: () => string | null }) => {
    chamados.push(repo);
    await new Promise((r) => setTimeout(r, 5));
    if (repo === "medio") return { repo, pulado: "sem commits novos" };
    const recusa = opts.reservar?.();
    if (recusa) return { repo, pulado: recusa };
    return { repo, runId: `${repo}/1`, runDir: "", status: erroDe[repo] ? "parcial" : "ok", custo_usd: 1, ingestao: null, erro: erroDe[repo] ?? null };
  },
}));

const { filaLote, foraDaFila, scanLote } = await import("../src/lote.ts");

let db: Db;
beforeEach(() => {
  db = abrirDb(":memory:");
  chamados.length = 0;
  erroDe = {};
});

describe("scan --all", () => {
  it("fila: sem vazios, arquivados, forks e irrelevantes, do push mais recente ao mais antigo", async () => {
    await scanLote(db, { concorrencia: 1 });
    expect(filaLote(db)).toEqual(["novo", "medio", "velho"]);
    expect(foraDaFila(db).map((r) => r.nome).sort()).toEqual(["arquivado", "bootcamp", "fork", "notas", "stub", "vazio"]);
  });

  it("a escolha manual vale mais que as regras", async () => {
    await scanLote(db, { concorrencia: 1 });
    definirSelecao(db, "bootcamp", "incluir");
    definirSelecao(db, "novo", "excluir", "tutorial");
    expect(filaLote(db)).toEqual(["medio", "velho", "bootcamp"]);
    expect(foraDaFila(db).find((r) => r.nome === "novo")?.motivo).toBe("excluído manualmente: tutorial");
  });

  it("analisa tudo com concorrência, soma o custo e conta os pulados", async () => {
    const r = await scanLote(db, { concorrencia: 2 });
    expect(chamados.sort()).toEqual(["medio", "novo", "velho"]);
    expect(r.custo_usd).toBe(2);
    expect(r.resultados.filter((x) => "pulado" in x).map((x) => x.repo)).toEqual(["medio"]);
    expect(r.interrompido).toBeNull();
  });

  it("--limite conta só análises feitas, mesmo com concorrência", async () => {
    const r = await scanLote(db, { concorrencia: 2, limite: 1 });
    expect(r.resultados.filter((x) => !("pulado" in x)).map((x) => x.repo)).toEqual(["novo"]);
    expect(r.interrompido).toBe("limite de 1 análises atingido");
  });

  it("para a fila quando a assinatura bate no limite", async () => {
    erroDe = { novo: "You've hit your weekly limit · resets 9am" };
    const r = await scanLote(db, { concorrencia: 1 });
    expect(chamados).toEqual(["novo"]);
    expect(r.interrompido).toMatch(/limite da assinatura: You've hit your weekly limit/);
  });
});
