"use client";
import { useActionState, useState } from "react";
import { definirSelecaoAcao } from "../lib/acoes.ts";

// "auto" = segue as regras de packages/db/src/filtro.ts; `regra` é o que elas dizem.
export function MudarSelecao({ repo, selecao, regra }: { repo: string; selecao: string | null; regra: string | null }) {
  const atual = selecao ?? "auto";
  const [escolhido, setEscolhido] = useState(atual);
  const [estado, acao, enviando] = useActionState(definirSelecaoAcao, { erro: null });
  return (
    <form action={acao} className="acoes">
      <input type="hidden" name="repo" value={repo} />
      <span className="suave">scan --all:</span>
      <select name="selecao" value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
        <option value="auto">automático ({regra ? `fora — ${regra}` : "na fila"})</option>
        <option value="incluir">sempre incluir</option>
        <option value="excluir">excluir</option>
      </select>
      {escolhido === "excluir" && atual !== "excluir" && (
        <input type="text" name="motivo" placeholder="motivo (obrigatório)" size={32} />
      )}
      <button type="submit" disabled={enviando || escolhido === atual}>
        salvar
      </button>
      {estado.erro && <span className="erro">{estado.erro}</span>}
    </form>
  );
}
