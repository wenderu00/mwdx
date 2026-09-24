"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Resultado } from "../lib/acoes.ts";

// O run "rodando" só aparece no banco depois do clone (ou da montagem do resumo),
// então após o clique a página continua atualizando por um tempo mesmo sem vê-lo.
const ESPERA_RUN_MS = 90_000;

export function Disparar({ acao, rodando, rotulo }: { acao: () => Promise<Resultado>; rodando: boolean; rotulo: string }) {
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
            const r = await acao();
            setErro(r.erro);
            if (!r.erro) setDisparadoEm(Date.now());
          })
        }
      >
        {aguardando ? "rodando…" : rotulo}
      </button>
      {erro && <span className="erro">{erro}</span>}
    </span>
  );
}
