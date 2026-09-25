import { notFound } from "next/navigation";
import { STATUS_ATIVOS, detalheRepo, motivoFora } from "@mwdx/db";
import { CartaoAchado } from "../../../components/CartaoAchado.tsx";
import { DIMENSOES, data, dinheiro } from "../../../components/formato.ts";
import { Disparar } from "../../../components/Disparar.tsx";
import { MudarSelecao } from "../../../components/MudarSelecao.tsx";
import { Nota } from "../../../components/Nota.tsx";
import { Sparkline } from "../../../components/Sparkline.tsx";
import { db } from "../../../lib/db.ts";
import { donoGithub } from "../../../lib/github.ts";
import { reanalisarAcao } from "../../../lib/acoes.ts";
import { promptCorrecao } from "../../../lib/prompt.ts";

export const dynamic = "force-dynamic";

export default async function Repo({ params }: { params: Promise<{ nome: string }> }) {
  const { nome } = await params;
  const d = detalheRepo(db(), decodeURIComponent(nome));
  if (!d) notFound();

  const { repo, runs, achados } = d;
  const comRelatorio = runs.filter((r) => Object.keys(r.notas).length);
  const [atual, anterior] = comRelatorio;
  const execucao = comRelatorio.find((r) => r.execucao)?.execucao ?? null;
  const rodando = runs.some((r) => r.status === "rodando");
  const dono = donoGithub();
  const ativos = new Set<string>(STATUS_ATIVOS);

  return (
    <>
      <header className="topo">
        <h1>{repo.nome}</h1>
        {dono && (
          <a href={`https://github.com/${dono}/${repo.nome}`} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        )}
        <Disparar acao={reanalisarAcao.bind(null, repo.nome)} rodando={rodando} rotulo="reanalisar" />
      </header>
      {repo.descricao && <p className="suave">{repo.descricao}</p>}
      <MudarSelecao repo={repo.nome} selecao={repo.selecao} regra={motivoFora({ ...repo, selecao: null })} />

      <div className="dimensoes">
        {DIMENSOES.map((dim) => {
          const nota = atual?.notas[dim];
          const serie = [...comRelatorio].reverse().flatMap((r) => (r.notas[dim] ? [r.notas[dim]!.valor] : []));
          return (
            <section key={dim} className="cartao">
              <h3>{dim}</h3>
              <div className="grande">
                <Nota valor={nota?.valor} anterior={anterior?.notas[dim]?.valor} />
              </div>
              <Sparkline valores={serie} />
              {nota && <p className="suave">{nota.justificativa}</p>}
            </section>
          );
        })}
      </div>

      {DIMENSOES.map((dim) => {
        const lista = achados.filter((a) => a.dimensao === dim);
        if (!lista.length) return null;
        const nAtivos = lista.filter((a) => ativos.has(a.status)).length;
        return (
          <section key={dim}>
            <h2>
              Achados · {dim} <span className="suave">({nAtivos} ativos de {lista.length})</span>
            </h2>
            {lista.map((a) => (
              <CartaoAchado key={a.id} achado={a} prompt={promptCorrecao(repo.nome, a, execucao)} />
            ))}
          </section>
        );
      })}

      <h2>Análises</h2>
      <div className="tabela-rolagem">
        <table>
          <thead>
            <tr>
              <th>início</th>
              <th>status</th>
              <th>HEAD</th>
              {DIMENSOES.map((dim) => (
                <th key={dim}>{dim}</th>
              ))}
              <th>custo</th>
              <th>duração</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} title={r.erro ?? undefined}>
                <td>{data(r.iniciado)}</td>
                <td>
                  <span className={`chip ${r.status === "erro" ? "ruim" : r.status === "ok" ? "" : r.status === "rodando" ? "info" : "alerta"}`}>
                    {r.status}
                  </span>
                  {r.erro && <pre className="log">{r.erro.slice(0, 300)}</pre>}
                </td>
                <td className="suave">
                  <code>{r.head_sha?.slice(0, 7) ?? "—"}</code>
                </td>
                {DIMENSOES.map((dim) => (
                  <td key={dim} className="num">
                    {r.notas[dim]?.valor ?? "—"}
                  </td>
                ))}
                <td className="num suave">{dinheiro(r.custo_usd)}</td>
                <td className="num suave">{r.duracao_s ? `${Math.round(r.duracao_s / 60)} min` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
