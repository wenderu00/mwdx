import "server-only";
import path from "node:path";
import { type Db, abrirDb, caminhoDbPadrao } from "@mwdx/db";
import { RAIZ } from "./raiz.ts";

// Uma conexão por processo; em dev, globalThis sobrevive ao HMR.
const g = globalThis as { mwdxDb?: Db };
export function db(): Db {
  g.mwdxDb ??= abrirDb(caminhoDbPadrao(), path.join(RAIZ, "packages/db/drizzle"));
  return g.mwdxDb;
}
