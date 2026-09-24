import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  Contexto,
  DIMENSOES,
  type Execucao,
  type RelatorioDimensao,
  validarArquivoRun,
} from "@mwdx/schema";
import { aplicarRelatorios, type Db, type ResultadoIngest } from "@mwdx/db";

export type Ingestao = ResultadoIngest & {
  status: "ok" | "parcial";
  dimensoes: string[];
  problemas: string[];
};

// Lê os JSON de um run dir, valida cada um (mesma regra do hook) e aplica no
// banco o que for válido. Uma dimensão inválida ou ausente não derruba as outras.
export function ingerirRunDir(db: Db, runDir: string, runId: string): Ingestao {
  const contexto = Contexto.parse(lerJson(path.join(runDir, "contexto.json")));
  const problemas: string[] = [];

  const relatorios: RelatorioDimensao[] = [];
  for (const dim of DIMENSOES) {
    const nome = `${dim}.json` as const;
    const dados = lerOpcional(path.join(runDir, nome));
    if (dados === undefined) {
      problemas.push(`${nome}: ausente`);
      continue;
    }
    const erros = validarArquivoRun(nome, dados, contexto);
    if (erros.length) problemas.push(...erros.map((e) => `${nome}: ${e}`));
    else relatorios.push(dados as RelatorioDimensao);
  }

  let execucao: Execucao | null = null;
  const bruto = lerOpcional(path.join(runDir, "execucao.json"));
  if (bruto === undefined) problemas.push("execucao.json: ausente");
  else {
    const erros = validarArquivoRun("execucao.json", bruto);
    if (erros.length) problemas.push(...erros.map((e) => `execucao.json: ${e}`));
    else execucao = bruto as Execucao;
  }

  if (!relatorios.length) throw new Error(`nenhum relatório válido em ${runDir}:\n${problemas.join("\n")}`);

  const res = aplicarRelatorios(db, runId, contexto.repo, relatorios, execucao);
  return {
    ...res,
    status: relatorios.length === DIMENSOES.length && execucao ? "ok" : "parcial",
    dimensoes: relatorios.map((r) => r.dimensao),
    problemas,
  };
}

function lerJson(arquivo: string): unknown {
  return JSON.parse(readFileSync(arquivo, "utf8"));
}

function lerOpcional(arquivo: string): unknown {
  if (!existsSync(arquivo)) return undefined;
  try {
    return lerJson(arquivo);
  } catch (e) {
    return { __json_invalido: (e as Error).message };
  }
}
