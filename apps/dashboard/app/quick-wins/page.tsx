import Link from "next/link";
import { quickWins } from "@mwdx/db";
import { CartaoAchado } from "../../components/CartaoAchado.tsx";
import { db } from "../../lib/db.ts";
import { promptCorrecao } from "../../lib/prompt.ts";

export const dynamic = "force-dynamic";

export default async function QuickWins({ searchParams }: { searchParams: Promise<{ amplo?: string }> }) {
  const amplo = !!(await searchParams).amplo;
  const lista = quickWins(db(), { amplo });
  const repos = new Set(lista.map((q) => q.repo)).size;
  return (
    <>
      <header className="topo">
        <h1>Quick-wins</h1>
        <span className="suave">
          {lista.length} achados ativos em {repos} repos ·{" "}
          {amplo ? "impacto maior que o esforço, até um dia de trabalho" : "impacto alto, menos de 1h de trabalho"}
        </span>
        <Link href={amplo ? "/quick-wins" : "/quick-wins?amplo=1"}>{amplo ? "só impacto alto × esforço baixo" : "ampliar"}</Link>
      </header>
      {lista.map(({ repo, achado, execucao }) => (
        <CartaoAchado
          key={achado.id}
          achado={achado}
          prompt={promptCorrecao(repo, achado, execucao)}
          extra={
            <Link href={`/repo/${repo}`} className="chip info">
              {repo}
            </Link>
          }
        />
      ))}
      {!lista.length && <p className="suave">Nenhum quick-win ativo. Rode <code>mwdx scan</code> em mais repos.</p>}
    </>
  );
}
