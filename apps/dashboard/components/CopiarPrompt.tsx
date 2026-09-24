"use client";
import { useState } from "react";

export function CopiarPrompt({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? "copiado ✓" : "copiar prompt de correção"}
    </button>
  );
}
