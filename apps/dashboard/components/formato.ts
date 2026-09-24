import { DIMENSOES } from "@mwdx/schema";

export { DIMENSOES };

export const classeNota = (v: number) => (v >= 70 ? "bom" : v >= 40 ? "medio" : "ruim");

// As notas oscilam alguns pontos entre execuções sem mudança no código;
// só vale destacar variações maiores.
export const DELTA_RELEVANTE = 10;

export function data(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export const dinheiro = (v: number | null) => (v == null ? "—" : `US$ ${v.toFixed(2)}`);
