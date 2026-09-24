import { and, desc, eq } from "drizzle-orm";
import { type Db, sincronizarRepos, tabelas } from "@mwdx/db";
import { listarRepos } from "./github.ts";
import { type ResultadoScan, scan } from "./scan.ts";

// Mensagens do claude quando a assinatura bate no limite: não adianta seguir a fila.
const LIMITE = /hit your .*limit|usage limit|limit reached/i;

export type OpcoesLote = {
  concorrencia?: number;
  limite?: number; // máximo de análises feitas (os pulados não contam)
  log?: (m: string) => void;
};

export type ResultadoLote = {
  resultados: ResultadoScan[];
  custo_usd: number;
  interrompido: string | null;
};

// Fila de `scan --all`: repos não vazios, não arquivados e que não são fork,
// dos mais recentes para os mais antigos. É retomável porque `scan` pula quem
// já foi analisado no HEAD atual.
export function filaLote(db: Db): string[] {
  const { repos } = tabelas;
  return db
    .select({ nome: repos.nome, github: repos.github_json })
    .from(repos)
    .where(and(eq(repos.vazio, false), eq(repos.arquivado, false)))
    .orderBy(desc(repos.pushed_at))
    .all()
    .filter((r) => !(r.github as { isFork?: boolean }).isFork)
    .map((r) => r.nome);
}

export async function scanLote(db: Db, opts: OpcoesLote = {}): Promise<ResultadoLote> {
  const log = opts.log ?? (() => {});
  sincronizarRepos(db, await listarRepos());
  const fila = filaLote(db);
  const total = fila.length;
  const res: ResultadoLote = { resultados: [], custo_usd: 0, interrompido: null };
  let reservadas = 0;
  const reservar = () => {
    if (opts.limite != null && reservadas >= opts.limite) {
      res.interrompido ??= `limite de ${opts.limite} análises atingido`;
      return res.interrompido;
    }
    reservadas++;
    return null;
  };

  const trabalhador = async () => {
    for (let repo = fila.shift(); repo && !res.interrompido; repo = fila.shift()) {
      const n = total - fila.length;
      let r: ResultadoScan;
      try {
        r = await scan(db, repo, { reservar, log: (m) => log(`[${n}/${total}] ${m}`) });
      } catch (e) {
        r = { repo, runId: "", runDir: "", status: "erro", custo_usd: null, ingestao: null, erro: (e as Error).message };
      }
      if ("pulado" in r) {
        if (r.pulado === res.interrompido) return; // vaga recusada pelo limite: não conta como pulado
        res.resultados.push(r);
        log(`[${n}/${total}] ${repo}: pulado — ${r.pulado}`);
        continue;
      }
      res.resultados.push(r);
      res.custo_usd += r.custo_usd ?? 0;
      log(`[${n}/${total}] ${repo}: ${r.status} · US$ ${(r.custo_usd ?? 0).toFixed(2)} · acumulado US$ ${res.custo_usd.toFixed(2)}`);
      if (r.erro && LIMITE.test(r.erro)) res.interrompido ??= `limite da assinatura: ${r.erro.split("\n").find((l) => LIMITE.test(l))}`;
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, opts.concorrencia ?? 2) }, trabalhador));
  return res;
}
