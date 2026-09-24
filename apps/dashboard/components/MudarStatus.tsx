"use client";
import { useActionState, useState } from "react";
import { mudarStatusAcao } from "../lib/acoes.ts";

const OPCOES = ["aberto", "em_andamento", "adiado", "ignorado", "resolvido"];

export function MudarStatus({ repo, id, status }: { repo: string; id: string; status: string }) {
  const [escolhido, setEscolhido] = useState(status);
  const [estado, acao, enviando] = useActionState(mudarStatusAcao, { erro: null });
  return (
    <form action={acao} className="acoes">
      <input type="hidden" name="repo" value={repo} />
      <input type="hidden" name="id" value={id} />
      <select name="status" value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
        {/* "regrediu" só o agente atribui, mas precisa aparecer quando é o status atual */}
        {[...new Set([status, ...OPCOES])].map((s) => (
          <option key={s} value={s} disabled={!OPCOES.includes(s)}>
            {s.replace("_", " ")}
          </option>
        ))}
      </select>
      {escolhido === "ignorado" && status !== "ignorado" && (
        <input type="text" name="motivo" placeholder="motivo (obrigatório)" size={32} />
      )}
      <button type="submit" disabled={enviando || escolhido === status}>
        salvar
      </button>
      {estado.erro && <span className="erro">{estado.erro}</span>}
    </form>
  );
}
