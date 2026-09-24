// Gera plugin/schemas/<arquivo>.schema.json a partir dos schemas Zod — os agentes
// leem esses arquivos para saber o formato exato que devem escrever.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ARQUIVOS_RUN } from "../src/index.ts";

const destino = path.resolve(import.meta.dirname, "../../../plugin/schemas");
mkdirSync(destino, { recursive: true });

for (const [arquivo, schema] of Object.entries(ARQUIVOS_RUN)) {
  const nome = arquivo.replace(".json", ".schema.json");
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" });
  writeFileSync(path.join(destino, nome), JSON.stringify(json, null, 2) + "\n");
  console.log(`plugin/schemas/${nome}`);
}
