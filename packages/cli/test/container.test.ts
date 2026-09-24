import { describe, expect, it } from "vitest";
import { nomeContainer, orfaos } from "../src/container.ts";

describe("nomeContainer", () => {
  it("prefixa com mwdx- e troca caracteres que o docker não aceita", () => {
    expect(nomeContainer("tilapia", "2026-09-24T01-02-03-456Z")).toBe("mwdx-tilapia-2026-09-24T01-02-03-456Z");
    expect(nomeContainer("meu repo/x", "t1")).toBe("mwdx-meu-repo-x-t1");
  });
});

describe("orfaos", () => {
  const agora = 10 * 60 * 60_000;
  it("devolve só containers mwdx- com label mais velho que o limite", () => {
    const saida = [
      `mwdx-velho-t1 ${agora - 2 * 60 * 60_000}`,
      `mwdx-novo-t2 ${agora - 5 * 60_000}`,
      "mwdx-sem-label ",
      `outro ${agora - 5 * 60 * 60_000}`,
      "",
    ].join("\n");
    expect(orfaos(saida, agora)).toEqual(["mwdx-velho-t1"]);
  });
});
