import type * as t from "./tabelas.ts";

type LinhaRepo = typeof t.repos.$inferSelect;

// Regras que tiram um repo da fila do `scan --all`. A escolha manual (repos.selecao)
// vale mais que elas; `scan <repo>` avulso não passa por aqui.
export const REGRAS = { minKb: 10, maxAnosSemPush: 3 };

// null = entra na fila; string = motivo de ficar de fora.
export function motivoFora(repo: LinhaRepo, agora = new Date()): string | null {
  if (repo.selecao === "incluir") return null;
  if (repo.selecao === "excluir") return `excluído manualmente: ${repo.selecao_motivo ?? "sem motivo"}`;
  const github = repo.github_json as { isFork?: boolean; diskUsage?: number };
  if (repo.vazio) return "vazio";
  if (repo.arquivado) return "arquivado";
  if (github.isFork) return "fork";
  if (!repo.linguagem) return "sem linguagem (docs/notas)";
  if (github.diskUsage != null && github.diskUsage < REGRAS.minKb) return `só ${github.diskUsage} KB`;
  const limite = new Date(agora);
  limite.setFullYear(limite.getFullYear() - REGRAS.maxAnosSemPush);
  if (repo.pushed_at && repo.pushed_at < limite.toISOString()) return `sem push desde ${repo.pushed_at.slice(0, 7)}`;
  return null;
}
