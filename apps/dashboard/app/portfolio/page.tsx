import Link from "next/link";
import { type Recomendacao, STATUS_ATIVOS, portfolio } from "@mwdx/db";
import { CartaoAchado } from "../../components/CartaoAchado.tsx";
import { Disparar } from "../../components/Disparar.tsx";
import { data, dinheiro } from "../../components/formato.ts";
import { estrategiaAcao } from "../../lib/acoes.ts";
import { db } from "../../lib/db.ts";
import { promptCorrecao } from "../../lib/prompt.ts";

export const dynamic = "force-dynamic";

function Lista({ titulo, itens, vazio }: { titulo: string; itens: Recomendacao[]; vazio: string }) {
  return (
    <section className="cartao">
      <h3>{titulo}</h3>
      {itens.length ? (
        <ul>
          {itens.map((r) => (
            <li key={r.repo}>
              <Link href={`/repo/${r.repo}`}>{r.repo}</Link> {r.privado && <span className="chip">privado</span>}
              {r.arquivado && <span className="chip">já arquivado</span>}
              <div className="suave">{r.motivo}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="suave">{vazio}</p>
      )}
    </section>
  );
}

export default function Portfolio() {
  const p = portfolio(db());
  const ativos = new Set<string>(STATUS_ATIVOS);
  const nAtivos = p.achados.filter((a) => ativos.has(a.status)).length;
  return (
    <>
      <header className="topo">
        <h1>Portfólio</h1>
        <span className="suave">
          {p.ultimoRun
            ? `última visão transversal: ${data(p.ultimoRun.iniciado)} · ${p.ultimoRun.status} · ${dinheiro(p.ultimoRun.custo_usd)}`
            : "visão transversal ainda não gerada"}
        </span>
        <Disparar acao={estrategiaAcao} rodando={p.rodando} rotulo="gerar visão transversal" />
      </header>
      {p.ultimoRun?.status === "erro" && p.ultimoRun.erro && <pre className="log erro">{p.ultimoRun.erro.slice(0, 600)}</pre>}

      <div className="dimensoes">
        <Lista titulo="Fixar no perfil" itens={p.fixar} vazio="Nenhuma recomendação ainda." />
        <Lista titulo="Arquivar" itens={p.arquivar} vazio="Nada para arquivar." />
      </div>

      <h2>
        Achados transversais <span className="suave">({nAtivos} ativos de {p.achados.length})</span>
      </h2>
      {p.achados.map((a) => (
        <CartaoAchado
          key={a.id}
          achado={a}
          prompt={promptCorrecao("", a, null)}
          extra={a.repos?.map((r) => (
            <Link key={r} href={`/repo/${r}`} className="chip info">
              {r}
            </Link>
          ))}
        />
      ))}
      {!p.achados.length && <p className="suave">Nenhum achado transversal ainda.</p>}
    </>
  );
}
