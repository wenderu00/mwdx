# mwdx

Plataforma pessoal de Developer Experience: uma inteligência (plugin do Claude
Code com subagentes) que analisa cada repositório do GitHub `wenderu00` em
**higiene de engenharia**, **arquitetura** e **portfólio**, com evidências
verificáveis e reconciliação entre execuções, além de uma **visão transversal**
dos projetos.

Plano completo: `~/.claude/plans/eu-quero-fazer-uma-synchronous-karp.md`. Próximos passos: [`docs/proximos-passos.md`](docs/proximos-passos.md).

## Estrutura

```
packages/schema/   contratos Zod (fonte única) → plugin/schemas/*.schema.json
packages/db/       SQLite (Drizzle + better-sqlite3): repos, runs, notas, achados, achado_eventos
packages/cli/      bin `mwdx`: repos sync, scan, ingest, achado, preparar
apps/dashboard/    Next.js local: notas, achados, triagem, prompt de correção, reanálise
plugin/            plugin Claude Code `mwdx`
  agents/          analisador-repo → executor-container → especialista-{higiene,arquitetura,portfolio} → auditor-relatorio
                   estrategista-portfolio (transversal)
  skills/          /mwdx:analisar-repo <repo> <run_dir>, /mwdx:estrategia <run_dir>
  hooks/           protege contexto.json; valida cada JSON gravado contra o schema Zod
  perfil.md        objetivo de carreira que calibra as notas (editável)
  regras-achados.md  o que é um achado válido (lido pelos especialistas e pelo auditor)
```

## Run dir

Cada análise acontece num diretório autocontido em `~/.mwdx/runs/<repo>/<ts>/`:

| Arquivo | Quem escreve |
|---|---|
| `contexto.json`, `work/`, `perfil.md`, `regras-achados.md`, `schemas/`, `bin/exec-container.sh` | CLI |
| `execucao.json` | executor-container |
| `higiene.json`, `arquitetura.json`, `portfolio.json` | especialistas |

A visão transversal usa `~/.mwdx/runs/_transversal/<ts>/`, com `resumo.json`
(CLI: todos os repos, notas, achados e os achados transversais ativos) e
`transversal.json` (estrategista).

## Desenvolvimento

O pnpm vem via corepack (`packageManager` no `package.json`), sem instalação global:

```bash
corepack pnpm install
corepack pnpm schemas      # regenera plugin/schemas a partir do Zod
corepack pnpm -r test
corepack pnpm -r typecheck
```

Uso (dados em `~/.mwdx`, ou em `MWDX_HOME`):

```bash
node packages/cli/bin/mwdx.js repos sync
node packages/cli/bin/mwdx.js scan tilapia            # pula se o HEAD não mudou; --force para reanalisar
node packages/cli/bin/mwdx.js scan --all --listar     # mostra a fila e quem ficou de fora, com o motivo
node packages/cli/bin/mwdx.js repos excluir telgram-bot --motivo "..."  # tira da fila (também: incluir, auto)
node packages/cli/bin/mwdx.js scan --all --limite 10  # concorrência 2; retomável; para no limite da assinatura
node packages/cli/bin/mwdx.js estrategia              # visão transversal (precisa de ≥ 2 repos analisados)
node packages/cli/bin/mwdx.js achado tilapia-higiene-2 ignorado --motivo "..."
node packages/cli/bin/mwdx.js ingest ~/.mwdx/runs/<repo>/<ts>
```

Dashboard em http://127.0.0.1:4400 (lê o mesmo `~/.mwdx/mwdx.db`; só escuta em localhost, sem autenticação):

```bash
corepack pnpm --filter @mwdx/dashboard dev
```

`scan` roda `claude -p` com `--setting-sources project --strict-mcp-config`: só o
plugin mwdx é carregado, sem os plugins, MCPs e hooks globais.

Nova migração depois de mudar `packages/db/src/tabelas.ts`:
`cd packages/db && ./node_modules/.bin/drizzle-kit generate --name <nome>`.

Analisar um repo local sem GitHub nem banco (dev):

```bash
RUN=$(node packages/cli/bin/mwdx.js preparar bioquest ~/projects/bioquest)
cd "$RUN" && claude -p "/mwdx:analisar-repo bioquest $RUN" \
  --plugin-dir ~/projects/mwdx/plugin --output-format json \
  --allowedTools Read Grep Glob Agent "Edit(/$RUN/**)" "Write(/$RUN/**)" "Bash($RUN/bin/exec-container.sh:*)"
```

## Estado

- [x] Fatia 1: schema + plugin + hooks + `mwdx preparar`
- [x] Fatia 2: `repos sync`, clone em cache, `scan` + `ingest` no SQLite + reconciliação
- [x] Fatia 3: executor em container
- [x] Fatia 4: dashboard
- [x] Fatia 5: `scan --all`, `estrategia`, quick-wins e portfólio
