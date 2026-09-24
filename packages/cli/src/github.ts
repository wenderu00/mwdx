import type { RepoGithub } from "@mwdx/db";
import { sh } from "./sh.ts";

const CAMPOS = [
  "name",
  "isPrivate",
  "isArchived",
  "isEmpty",
  "isFork",
  "description",
  "primaryLanguage",
  "defaultBranchRef",
  "pushedAt",
  "createdAt",
  "repositoryTopics",
  "homepageUrl",
  "stargazerCount",
  "diskUsage",
  "licenseInfo",
].join(",");

let donoCache: string | undefined;
export async function dono(): Promise<string> {
  donoCache ??= process.env.MWDX_OWNER ?? (await sh("gh", ["api", "user", "--jq", ".login"]));
  return donoCache;
}

export async function listarRepos(): Promise<RepoGithub[]> {
  const saida = await sh("gh", ["repo", "list", await dono(), "--limit", "500", "--json", CAMPOS]);
  return JSON.parse(saida) as RepoGithub[];
}

// SHA do HEAD da branch padrão sem clonar — decide se o repo precisa de nova análise.
export async function headRemoto(repo: string, branch: string): Promise<string> {
  return sh("gh", ["api", `repos/${await dono()}/${repo}/commits/${branch}`, "--jq", ".sha"]);
}

// Metadados que não vêm no `gh repo list`, para contexto.json → github.
export async function metadadosExtras(repo: string): Promise<Record<string, unknown>> {
  const alvo = `${await dono()}/${repo}`;
  const [api, ci] = await Promise.all([
    sh("gh", ["api", `repos/${alvo}`, "--jq", "{open_issues_count, has_pages, forks_count, size}"]).then(JSON.parse),
    sh("gh", ["run", "list", "-R", alvo, "--limit", "5", "--json", "workflowName,conclusion,status,createdAt,headBranch"])
      .then(JSON.parse)
      .catch(() => []),
  ]);
  return { ...api, ci_ultimas_execucoes: ci };
}

// O agente lê contexto.json → github; nomes curtos e sem aninhamento inútil.
export function normalizarGithub(r: RepoGithub, extras: Record<string, unknown>): Record<string, unknown> {
  const topics = (r.repositoryTopics as { name: string }[] | null)?.map((t) => t.name) ?? [];
  return {
    nome: r.name,
    visibilidade: r.isPrivate ? "privado" : "publico",
    arquivado: r.isArchived,
    fork: r.isFork,
    descricao: r.description || null,
    topics,
    homepage: (r.homepageUrl as string) || null,
    linguagem_principal: r.primaryLanguage?.name ?? null,
    stars: r.stargazerCount,
    licenca: (r.licenseInfo as { name: string } | null)?.name ?? null,
    criado_em: r.createdAt,
    pushed_at: r.pushedAt,
    branch_padrao: r.defaultBranchRef?.name ?? null,
    ...extras,
  };
}
