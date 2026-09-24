import { DELTA_RELEVANTE, classeNota } from "./formato.ts";

export function Nota({ valor, anterior }: { valor?: number; anterior?: number }) {
  if (valor == null) return <span className="suave">—</span>;
  const delta = anterior == null ? 0 : valor - anterior;
  return (
    <span title={anterior == null ? undefined : `anterior: ${anterior}`}>
      <span className={`nota ${classeNota(valor)}`}>{valor}</span>
      {Math.abs(delta) >= DELTA_RELEVANTE && (
        <span className={`delta nota ${delta > 0 ? "bom" : "ruim"}`}>{delta > 0 ? `▲${delta}` : `▼${-delta}`}</span>
      )}
    </span>
  );
}
