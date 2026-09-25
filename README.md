# mwdx

Auditoria repetível de dezenas de repositórios do GitHub. Cada repo recebe uma nota
em **higiene de engenharia**, **arquitetura** e **portfólio**, com achados que
apontam para um arquivo e uma linha e trazem uma ação concreta. Os achados são
acompanhados entre execuções: a análise seguinte diz se cada um foi resolvido,
persiste ou regrediu. Uma **visão transversal** cruza todos os repos e diz o que
fixar no perfil, o que arquivar e quais padrões se repetem.

**Stack:** TypeScript · Zod · SQLite/Drizzle · subagentes do Claude Code · Docker · Next.js · Vitest

A análise é feita por um plugin do Claude Code com subagentes rodando em modo headless.
O código de cada repo é executado num container descartável, e a saída dos agentes é
validada contra os mesmos schemas Zod que o banco usa. Detalhes e trade-offs em
[`docs/arquitetura.md`](docs/arquitetura.md).

### Exemplo: o mwdx analisando a si mesmo

| Dimensão | Nota |
|---|---|
| Arquitetura | 74 |
| Higiene | 60 |
| Portfólio | 48 |

Um dos achados (`mwdx-arquitetura-3`, impacto 2, esforço 1):

> **Falha entre iniciarRun e finalizarRun deixa o run preso em 'rodando' e bloqueia novos scans por 1h**
>
> - `packages/cli/src/scan.ts:70`: iniciarRun grava status 'rodando'; finalizarRun só na linha 85, sem try/finally cobrindo as linhas 72-74
> - `packages/cli/src/scan.ts:27`: RODANDO_VALIDO_MS = 1h: um run órfão faz o scan seguinte retornar 'já existe análise em andamento'
>
> **Ação:** envolver o trecho após iniciarRun em try/finally que chama finalizarRun com status 'erro' e adicionar um teste em que rodarClaude lança.

No dashboard, cada achado tem um botão que copia um prompt de correção pronto para
colar no Claude Code dentro do repo analisado.

## O que já funciona

- `scan` de ponta a ponta verificado em repos reais de Node, .NET e Java, com reanálise confirmando a reconciliação dos achados.
- Execução dos testes, do build e do audit em container, com limpeza garantida mesmo em falha ou Ctrl+C.
- `scan --all` com fila filtrada, concorrência 2, retomada e parada automática no limite da assinatura.
- Dashboard local com notas, histórico, triagem de achados (ignorar exige motivo), quick-wins, portfólio e botão de reanalisar.
- Visão transversal com recomendações de fixar e arquivar e achados que abrangem vários repos.

Roadmap e pendências em [`docs/proximos-passos.md`](docs/proximos-passos.md).

## Pré-requisitos

Para rodar os testes, basta o **Node ≥ 24** (há um `.nvmrc`). O pnpm vem pelo corepack.

Para analisar repos de verdade, também são necessários:

- **gh** autenticado (`gh auth login`);
- **Claude Code** (`claude`) com login feito;
- **Docker**. Sem ele, a análise roda assim mesmo, mas sem executar o código (`container: null`).

| Variável | Padrão | Efeito |
|---|---|---|
| `MWDX_HOME` | `~/.mwdx` | Onde ficam o banco, o cache de clones, os run dirs, os logs e o seu `perfil.md` |
| `MWDX_OWNER` | usuário do `gh` | Dono dos repos a analisar |
| `MWDX_CLAUDE_BIN` | `claude` | Binário do Claude Code (útil para testes com um binário falso) |
| `MWDX_RAIZ` | `../..` do cwd | Raiz do repo, usada pelo dashboard para achar as migrações e a CLI |

**Perfil:** as notas de portfólio são calibradas por um perfil (objetivo de carreira,
público-alvo). O repo traz [`plugin/perfil.exemplo.md`](plugin/perfil.exemplo.md).
Copie-o para `~/.mwdx/perfil.md` e edite; se esse arquivo existir, ele é usado no lugar do exemplo.

## Uso

```bash
corepack pnpm install
corepack pnpm -r test && corepack pnpm -r typecheck

node packages/cli/bin/mwdx.js repos sync
node packages/cli/bin/mwdx.js scan <repo>                # pula se o HEAD não mudou; --force para reanalisar
node packages/cli/bin/mwdx.js scan --all --listar        # mostra a fila e quem ficou de fora, com o motivo
node packages/cli/bin/mwdx.js repos excluir <repo> --motivo "..."  # tira da fila (também: incluir, auto)
node packages/cli/bin/mwdx.js scan --all --limite 10     # concorrência 2; retomável; para no limite da assinatura
node packages/cli/bin/mwdx.js estrategia                 # visão transversal (precisa de ≥ 2 repos analisados)
node packages/cli/bin/mwdx.js achado <id> ignorado --motivo "..."
node packages/cli/bin/mwdx.js ingest ~/.mwdx/runs/<repo>/<ts>
```

Dashboard em http://127.0.0.1:4400. Ele lê o mesmo `~/.mwdx/mwdx.db`, só escuta em
localhost e não tem autenticação:

```bash
corepack pnpm --filter @mwdx/dashboard dev
```

## Estrutura

```
packages/schema/   contratos Zod (fonte única) → plugin/schemas/*.schema.json
packages/db/       SQLite (Drizzle + better-sqlite3): repos, runs, notas, achados, achado_eventos
packages/cli/      bin `mwdx`: repos, scan, ingest, estrategia, achado, preparar
apps/dashboard/    Next.js local: notas, achados, triagem, prompt de correção, reanálise
plugin/            plugin Claude Code `mwdx`
  agents/          analisador-repo → executor-container → especialista-{higiene,arquitetura,portfolio} → auditor-relatorio
                   estrategista-portfolio (transversal)
  skills/          /mwdx:analisar-repo <repo> <run_dir>, /mwdx:estrategia <run_dir>
  hooks/           protege contexto.json; valida cada JSON gravado contra o schema Zod
  perfil.exemplo.md  perfil padrão que calibra as notas (o seu fica em ~/.mwdx/perfil.md)
  regras-achados.md  o que é um achado válido (lido pelos especialistas e pelo auditor)
```

### Run dir

Cada análise acontece num diretório autocontido em `~/.mwdx/runs/<repo>/<ts>/`:

| Arquivo | Quem escreve |
|---|---|
| `contexto.json`, `work/`, `perfil.md`, `regras-achados.md`, `schemas/`, `bin/exec-container.sh` | CLI |
| `execucao.json` | executor-container |
| `higiene.json`, `arquitetura.json`, `portfolio.json` | especialistas |

A visão transversal usa `~/.mwdx/runs/_transversal/<ts>/`, com `resumo.json`
(escrito pela CLI) e `transversal.json` (escrito pelo estrategista).

## Desenvolvimento

- `corepack pnpm schemas` regenera `plugin/schemas` a partir do Zod. O CI falha se os arquivos commitados estiverem desatualizados.
- Nova migração depois de mudar `packages/db/src/tabelas.ts`:
  `cd packages/db && ./node_modules/.bin/drizzle-kit generate --name <nome>`.
- Para depurar o plugin num repo local, sem GitHub nem banco (rode da raiz do repo):

```bash
RUN=$(node packages/cli/bin/mwdx.js preparar <repo> <caminho-do-repo>)
cd "$RUN" && claude -p "/mwdx:analisar-repo <repo> $RUN" \
  --plugin-dir "$OLDPWD/plugin" --output-format json \
  --allowedTools Read Grep Glob Agent "Edit(/$RUN/**)" "Write(/$RUN/**)" "Bash($RUN/bin/exec-container.sh:*)"
```

## Licença

[MIT](LICENSE)
