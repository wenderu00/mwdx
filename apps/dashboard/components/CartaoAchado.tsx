import type { ReactNode } from "react";
import { STATUS_ATIVOS, type AchadoDetalhe } from "@mwdx/db";
import { semWork } from "../lib/prompt.ts";
import { CopiarPrompt } from "./CopiarPrompt.tsx";
import { MudarStatus } from "./MudarStatus.tsx";

const ESCALA = ["", "baixo", "médio", "alto"];
const ATIVOS = new Set<string>(STATUS_ATIVOS);

export function CartaoAchado({ achado: a, prompt, extra }: { achado: AchadoDetalhe; prompt: string; extra?: ReactNode }) {
  const ativo = ATIVOS.has(a.status);
  return (
    <article className={`cartao achado ${ativo ? "" : "inativo"}`}>
      <div>
        {extra}
        <span className="chip">{a.tipo}</span>
        <span className={`chip ${a.impacto === 3 ? "ruim" : ""}`}>impacto {ESCALA[a.impacto]}</span>
        <span className="chip">esforço {ESCALA[a.esforco]}</span>
        <span className="suave">{a.id}</span>
      </div>
      <div className="titulo">{a.titulo}</div>
      <p>{a.acao}</p>
      <ul>
        {a.evidencias.map((e, i) => (
          <li key={i}>
            {"arquivo" in e ? (
              <code>
                {e.arquivo}
                {e.linha ? `:${e.linha}` : ""}
              </code>
            ) : "execucao" in e ? (
              <code>{semWork(e.execucao)}</code>
            ) : (
              <code>github.{e.github}</code>
            )}{" "}
            <span className="suave">— {e.obs}</span>
          </li>
        ))}
      </ul>
      {a.status === "ignorado" && a.ultimoEvento?.motivo && <p className="suave">Ignorado: {a.ultimoEvento.motivo}</p>}
      <div className="acoes">
        <MudarStatus id={a.id} status={a.status} />
        {ativo && <CopiarPrompt texto={prompt} />}
      </div>
    </article>
  );
}
