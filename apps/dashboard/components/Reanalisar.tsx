"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { reanalisarAcao } from "../lib/acoes.ts";

// O run "rodando" só aparece no banco depois do clone, então após o clique a
// página continua atualizando por um tempo mesmo sem ver o run ainda.
const ESPERA_RUN_MS = 90_000;

export function Reanalisar({ repo, rodando }: { repo: string; rodando: boolean }) {
  const router = useRouter();
  const [disparadoEm, setDisparadoEm] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const aguardando = rodando || (disparadoEm != null && Date.now() - disparadoEm < ESPERA_RUN_MS);

  useEffect(() => {
    if (!aguardando) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [aguardando, router]);

  return (
    <span className="acoes">
      <button
        className="primario"
        disabled={pendente || aguardando}
        onClick={() =>
          iniciar(async () => {
            const r = await reanalisarAcao(repo);
            setErro(r.erro);
            if (!r.erro) setDisparadoEm(Date.now());
          })
        }
      >
        {aguardando ? "analisando…" : "reanalisar"}
      </button>
      {erro && <span className="erro">{erro}</span>}
    </span>
  );
}
