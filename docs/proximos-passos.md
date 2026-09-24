# Próximos passos

Estado em 2026-09-24: fatias 1 e 2 concluídas e verificadas ponta a ponta
(bioquest via `claude -p` direto; tilapia via `mwdx scan`, com reanálise
`--force` confirmando a reconciliação). Plano original:
`~/.claude/plans/eu-quero-fazer-uma-synchronous-karp.md`.

## Retomar

```bash
cd ~/projects/mwdx
corepack pnpm install
corepack pnpm -r test && corepack pnpm -r typecheck   # 24 testes
```

`~/.mwdx` ainda está vazio. Os testes reais rodaram num `MWDX_HOME` de rascunho.
O primeiro uso de verdade é `node packages/cli/bin/mwdx.js repos sync`.

## Fatia 3: executor em container

Hoje `scan` grava `container: null` (em `packages/cli/src/scan.ts`, comentário
"fatia 3"), e o executor registra `status: "sem_container"`.

1. `packages/cli/src/container.ts`:
   - `subirContainer(runDir, imagem, repo, ts)`: executa
     `docker run -d --name mwdx-<repo>-<ts> --memory 4g --cpus 2 -v <runDir>/work:/work -w /work <imagem> sleep infinity`
     e devolve o nome. O nome precisa começar com `mwdx-`, porque é o que
     `plugin/scripts/exec-container.sh` aceita.
   - `derrubarContainer(nome)`: `docker rm -f`, chamado em `finally` no `scan`
     (inclusive em erro ou timeout do `claude -p`).
   - `docker pull` da imagem na primeira vez (as imagens estão em `stack.ts`).
   - Limpeza de órfãos: `docker ps -a --filter name=mwdx- -q`, rodada no início
     de cada `scan`, para containers de mais de 1h.
2. Em `scan.ts`: subir o container depois do `prepararRunDir` e preencher
   `contexto.container`. **Atenção**: o `contexto.json` é escrito dentro do
   `prepararRunDir`. Ou o container sobe antes (montando `work/` já copiado),
   ou o `prepararRunDir` passa a aceitar o contexto depois da cópia.
3. Arquivos criados pelo container (ex.: `node_modules` como root) ficam em
   `runs/<repo>/<ts>/work`. Usar `--user $(id -u):$(id -g)` ou limpar `work/`
   ao final. Decidir se vale guardar `work/` depois do ingest, já que ocupa disco.
4. Verificar: `mwdx scan tilapia --force` (Node) e
   `mwdx scan GamingShoppingApp --force` (.NET antigo, esperado registrar
   runtime incompatível). Conferir o `execucao.json` e que
   `docker ps -a | grep mwdx-` fica vazio.
5. Medir de novo o custo por repo: vai subir com install e testes (hoje fica
   entre US$ 2,30 e 4,20 equivalentes).

## Fatia 4: dashboard (`apps/dashboard`)

Next.js (App Router) lendo o mesmo SQLite via `@mwdx/db`
(`abrirDb`, `mudarStatus`, `historicoParaContexto`).

- `/`: tabela dos repos com as notas mais recentes por dimensão, filtros (stack,
  visibilidade, ativo) e badge "HEAD mudou" (comparar `repos.pushed_at` com o
  `iniciado` do último run).
- `/repo/[nome]`: notas com histórico (sparkline), achados por dimensão, ações de
  status (ignorar exige motivo) e **copiar prompt de correção** (achado +
  evidências + ação + "rode no repo e verifique com ...").
- Botão "reanalisar": route handler faz spawn detached de
  `node packages/cli/bin/mwdx.js scan <repo> --force`; a UI consulta `runs.status`.
- `better-sqlite3` no Next: declarar em `serverExternalPackages`.
- As notas oscilam entre execuções sem mudança no código (tilapia: higiene
  28 → 25, portfólio 12 → 18). Considerar mostrar tendência/faixa em vez de
  destacar variações pequenas.

## Fatia 5: lote e visão transversal

- `mwdx scan --all`: fila com concorrência 2, retomável (pula o que já tem run
  `ok` no HEAD atual, que já é o comportamento do skip) e ordenada por
  `pushed_at` desc (os ativos primeiro). Pular repos vazios e arquivados.
  Mostrar o custo acumulado.
- `mwdx estrategia`: exportar `resumo.json` do banco (um item por repo: github,
  stack, notas, achados ativos e ignorados) num run dir
  `runs/_transversal/<ts>/` com `perfil.md`, `regras-achados.md` e `schemas/`.
  Rodar `claude -p "/mwdx:estrategia <run_dir>"` e ingerir `transversal.json`.
  - Falta no banco: achados transversais com vários repos. Opção: `repo = "_transversal"`
    mais uma coluna `repos_json`, e tabelas para `fixar_no_perfil`/`arquivar` por run.
- Dashboard: `/quick-wins` (impacto alto × esforço baixo, todos os repos) e
  `/portfolio` (transversal, fixar/arquivar).

## Pendências e observações

- **Custo**: US$ 2,30–4,20 equivalentes por repo (5–8 min). O baseline de 65
  repos não vazios fica perto de US$ 200 no limite da assinatura. Começar pelos
  ativos.
- **Qualidade**: só o auditor valida (decisão consciente). O motivo de cada
  "ignorar" fica em `achado_eventos`. Se os insights ficarem genéricos, esses
  dados servem de base para um eval.
- `mwdx preparar` e o comando manual do README servem só para depurar o plugin
  sem banco.
