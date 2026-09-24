// Série de notas (0–100), da mais antiga para a mais recente.
export function Sparkline({ valores }: { valores: number[] }) {
  if (valores.length < 2) return null;
  const l = 160, a = 36, p = 3;
  const x = (i: number) => p + (i * (l - 2 * p)) / (valores.length - 1);
  const y = (v: number) => a - p - (v / 100) * (a - 2 * p);
  const pontos = valores.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const ultimo = valores.length - 1;
  return (
    <svg width={l} height={a} role="img" aria-label={`histórico: ${valores.join(", ")}`}>
      <line x1={p} x2={l - p} y1={y(50)} y2={y(50)} stroke="var(--borda)" strokeDasharray="2 3" />
      <polyline points={pontos} fill="none" stroke="var(--destaque)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(ultimo)} cy={y(valores[ultimo]!)} r="3" fill="var(--destaque)" />
    </svg>
  );
}
