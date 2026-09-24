import Link from "next/link";
import { painel } from "@mwdx/db";
import { AtualizarEnquanto } from "../components/AtualizarEnquanto.tsx";
import { DIMENSOES, data, dinheiro } from "../components/formato.ts";
import { Nota } from "../components/Nota.tsx";
import { db } from "../lib/db.ts";

export const dynamic = "force-dynamic";

type Filtros = { stack?: string; visibilidade?: string; situacao?: string; analisados?: string };

export default async function Inicio({ searchParams }: { searchParams: Promise<Filtros> }) {
  const f = await searchParams;
  const todos = painel(db());
  const stacks = [...new Set(todos.map((r) => r.stack).filter((s): s is string => !!s))].sort();
  const situacao = f.situacao ?? "ativos";

  const itens = todos.filter(
    (r) =>
      (!f.stack || r.stack === f.stack) &&
      (!f.visibilidade || (f.visibilidade === "privado") === r.privado) &&
      (situacao === "todos" || (situacao === "arquivados") === r.arquivado) &&
      (!f.analisados || r.ultimoRun),
  );
  const analisados = todos.filter((r) => Object.keys(r.notas).length);
  const ativos = todos.reduce((s, r) => s + r.ativos, 0);

  return (
    <>
      <AtualizarEnquanto ativo={todos.some((r) => r.rodando)} />
      <header className="topo">
        <h1>Repos</h1>
        <span className="suave">
          {analisados.length} de {todos.length} repos analisados · {ativos} achados ativos
        </span>
      </header>

      <form className="filtros">
        <select name="stack" defaultValue={f.stack ?? ""}>
          <option value="">todas as stacks</option>
          {stacks.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select name="visibilidade" defaultValue={f.visibilidade ?? ""}>
          <option value="">públicos e privados</option>
          <option value="publico">públicos</option>
          <option value="privado">privados</option>
        </select>
        <select name="situacao" defaultValue={situacao}>
          <option value="ativos">não arquivados</option>
          <option value="arquivados">arquivados</option>
          <option value="todos">todos</option>
        </select>
        <label>
          <input type="checkbox" name="analisados" value="1" defaultChecked={!!f.analisados} /> só analisados
        </label>
        <button type="submit">filtrar</button>
      </form>

      <div className="tabela-rolagem">
        <table>
          <thead>
            <tr>
              <th>repo</th>
              <th>stack</th>
              {DIMENSOES.map((d) => (
                <th key={d}>{d}</th>
              ))}
              <th>ativos</th>
              <th>última análise</th>
              <th>custo</th>
              <th>push</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((r) => (
              <tr key={r.nome}>
                <td>
                  <Link href={`/repo/${r.nome}`}>{r.nome}</Link> {r.privado && <span className="chip">privado</span>}
                  {r.arquivado && <span className="chip">arquivado</span>}
                  {r.rodando && <span className="chip info">analisando…</span>}
                  {r.headMudou && <span className="chip alerta">HEAD mudou</span>}
                </td>
                <td className="suave">{r.stack ?? r.linguagem ?? "—"}</td>
                {DIMENSOES.map((d) => (
                  <td key={d}>
                    <Nota valor={r.notas[d]?.valor} anterior={r.notasAnteriores[d]?.valor} />
                  </td>
                ))}
                <td className="num">{r.ultimoRun ? r.ativos : "—"}</td>
                <td>
                  {r.ultimoRun ? (
                    <>
                      {data(r.ultimoRun.iniciado)}{" "}
                      {r.ultimoRun.status !== "ok" && (
                        <span className={`chip ${r.ultimoRun.status === "erro" ? "ruim" : r.ultimoRun.status === "rodando" ? "info" : "alerta"}`}>
                          {r.ultimoRun.status}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="suave">nunca</span>
                  )}
                </td>
                <td className="num suave">{dinheiro(r.ultimoRun?.custo_usd ?? null)}</td>
                <td className="suave">{data(r.pushed_at)}</td>
              </tr>
            ))}
            {!itens.length && (
              <tr>
                <td colSpan={9} className="suave">
                  Nenhum repo. Rode <code>mwdx repos sync</code> ou ajuste os filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
