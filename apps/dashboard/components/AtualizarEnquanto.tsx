"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Enquanto houver análise rodando, recarrega os dados do servidor a cada 5 s.
export function AtualizarEnquanto({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [ativo, router]);
  return null;
}
