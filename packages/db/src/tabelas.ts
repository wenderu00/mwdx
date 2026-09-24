import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const repos = sqliteTable("repos", {
  nome: text().primaryKey(),
  privado: integer({ mode: "boolean" }).notNull(),
  arquivado: integer({ mode: "boolean" }).notNull(),
  vazio: integer({ mode: "boolean" }).notNull(),
  linguagem: text(),
  descricao: text(),
  branch_padrao: text(),
  pushed_at: text(),
  // resposta de `gh repo list` normalizada; vai para contexto.json → github
  github_json: text({ mode: "json" }).notNull(),
  sincronizado_em: text().notNull(),
});

export const runs = sqliteTable(
  "runs",
  {
    id: text().primaryKey(), // "<repo>/<ts>", igual ao caminho relativo do run dir
    repo: text().notNull(),
    head_sha: text(),
    run_dir: text().notNull(),
    status: text({ enum: ["rodando", "ok", "parcial", "erro"] }).notNull(),
    iniciado: text().notNull(),
    fim: text(),
    custo_usd: real(),
    duracao_s: real(),
    execucao_json: text({ mode: "json" }),
    resumo: text(),
    erro: text(),
  },
  (t) => [index("runs_repo").on(t.repo, t.iniciado)],
);

export const notas = sqliteTable(
  "notas",
  {
    run_id: text().notNull(),
    dimensao: text().notNull(),
    valor: integer().notNull(),
    justificativa: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.run_id, t.dimensao] })],
);

export const achados = sqliteTable(
  "achados",
  {
    id: text().primaryKey(), // "<repo>-<dimensao>-<n>"
    repo: text().notNull(),
    dimensao: text().notNull(),
    tipo: text({ enum: ["lacuna", "oportunidade"] }).notNull(),
    titulo: text().notNull(),
    evidencias_json: text({ mode: "json" }).notNull(),
    impacto: integer().notNull(),
    esforco: integer().notNull(),
    acao: text().notNull(),
    status: text().notNull(),
    criado_run: text().notNull(),
    atualizado_run: text().notNull(),
  },
  (t) => [index("achados_repo").on(t.repo, t.dimensao, t.status)],
);

export const achadoEventos = sqliteTable(
  "achado_eventos",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    achado_id: text().notNull(),
    de: text(),
    para: text().notNull(),
    origem: text({ enum: ["agente", "usuario"] }).notNull(),
    motivo: text(),
    run_id: text(),
    em: text().notNull(),
  },
  (t) => [index("eventos_achado").on(t.achado_id)],
);
