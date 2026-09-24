# Próximos passos

Estado em 2026-09-24: fatias 1 a 5 concluídas e verificadas ponta a ponta
(bioquest via `claude -p` direto; tilapia via `mwdx scan`, com reanálise
`--force` confirmando a reconciliação; tilapia e GamingShoppingApp com container). Plano original:
`~/.claude/plans/eu-quero-fazer-uma-synchronous-karp.md`.

## Retomar

```bash
cd ~/projects/mwdx
corepack pnpm install
corepack pnpm -r test && corepack pnpm -r typecheck   # 44 testes
```

`~/.mwdx` ainda está vazio. Os testes reais rodaram num `MWDX_HOME` de rascunho.
O primeiro uso de verdade é `node packages/cli/bin/mwdx.js repos sync`.
Dashboard: `corepack pnpm --filter @mwdx/dashboard dev` → http://127.0.0.1:4400.

## Fatia 3: executor em container (concluída)

`packages/cli/src/container.ts` + `scan.ts`: o nome `mwdx-<repo>-<ts>` entra no
`contexto.json` antes de o container subir (montando o `work/` já copiado), com
`--user` local e `HOME=/tmp`. Se o container não sobe, o run segue com
`container: null` e o motivo vai para `runs.erro`. O container é derrubado em
`finally` e em SIGINT/SIGTERM; órfãos com mais de 1h são removidos no início de
cada `scan`. Depois do ingest, `git clean -ffdx` em `work/` descarta dependências
e builds (tilapia: 1,4 MB).

Verificado: tilapia (Node, install/build/lint/audit reais, US$ 3,60) e
GamingShoppingApp (net6.0 numa imagem SDK 8: registrou a incompatibilidade e
testou com `DOTNET_ROLL_FORWARD=Major`, US$ 1,64 até bater o limite semanal).
Nenhum `mwdx-*` sobrou em `docker ps -a`.

Em aberto: testes e2e que precisam de servidor rodando ou do Chrome do Puppeteer
ficam de fora (status `parcial`); a imagem é fixa por stack, então runtimes antigos
dependem do roll-forward.

## Fatia 4: dashboard (concluída)

`apps/dashboard` (Next.js 16, App Router) lê o SQLite pelas consultas de
`packages/db/src/consultas.ts` (`painel`, `detalheRepo`).

- `/`: repos com notas do último run (seta só para variação ≥ 10, porque as notas
  oscilam alguns pontos sem mudança no código), achados ativos, custo, badges
  "HEAD mudou"/"analisando…" e filtros (stack, visibilidade, arquivados, só analisados).
- `/repo/[nome]`: nota + sparkline + justificativa por dimensão, achados com troca
  de status (Server Action em `mudarStatus`; ignorar exige motivo) e copiar prompt
  de correção (`lib/prompt.ts`), histórico de runs.
- Reanalisar: Server Action faz spawn desacoplado de `mwdx scan <repo> --force`,
  com log em `~/.mwdx/logs/`; a página atualiza a cada 5 s enquanto há run rodando.
- O Turbopack empacota os pacotes do workspace mesmo com `serverExternalPackages`,
  então `abrirDb` aceita a pasta de migrações e o dashboard passa
  `<raiz>/packages/db/drizzle` (raiz = `MWDX_RAIZ` ou `../..` do cwd).

Verificado com `next build`/`start` e `dev` no banco de rascunho: páginas,
troca de status pelo form (inclusive o erro de ignorar sem motivo) e o spawn da
CLI (com repo inexistente, para não gastar análise). Falta ver a reanálise real
terminando e o sparkline com mais de um run.

## Fatia 5: lote e visão transversal (concluída)

- `mwdx scan --all [--concorrencia 2] [--limite n] [--listar]` (`packages/cli/src/lote.ts`):
  fila de repos não vazios, não arquivados e que não são fork, por `pushed_at`
  desc (57 hoje). É retomável porque `scan` pula quem já foi analisado no HEAD
  atual. `--limite` conta só análises feitas (a vaga é reservada dentro do
  `scan`, depois do skip). A fila para sozinha quando o claude responde que bateu
  no limite da assinatura. Um único handler de SIGINT derruba todos os containers
  vivos; órfãos agora são os com mais de 2h.
- `mwdx estrategia` (`packages/cli/src/estrategia.ts`): `resumoTransversal` monta
  `resumo.json` (todos os repos, notas, achados ativos/ignorados e os achados
  transversais ativos), roda `/mwdx:estrategia` e ingere `transversal.json`.
  - Achados transversais ficam em `achados` com `repo = "_transversal"`,
    `dimensao = "transversal"`, id `transversal-<n>` e `repos_json`; o estrategista
    reconcilia cada ativo (`persistente`/`resolvido`), igual aos especialistas.
  - Fixar/arquivar vão para `recomendacoes` (foto de cada run; o dashboard mostra a do último run ok).
  - O hook valida `transversal.json` contra `resumo.json` (repos existentes,
    reconciliação completa, repo não pode estar em fixar e arquivar).
- Dashboard: `/quick-wins` (impacto alto × esforço baixo; "ampliar" inclui 3×2 e 2×1)
  e `/portfolio` (fixar/arquivar, achados transversais com status e prompt,
  botão "gerar visão transversal").

Verificado com um `claude` falso (`MWDX_CLAUDE_BIN`): estrategia duas vezes no banco
de rascunho (a segunda reconciliou o achado da primeira), hook rejeitando repo
inexistente, disparo e troca de status pelo dashboard, e `scan --all --listar`
com o GitHub real. **Não verificado com o claude real**: o estrategista seguindo o
novo formato (reconciliação) e um lote real.

## Primeiro uso real

1. `node packages/cli/bin/mwdx.js repos sync` (o `~/.mwdx` real ainda está vazio).
2. `scan --all --limite 5` para medir custo e qualidade nos repos mais ativos; depois o resto
   (57 repos × US$ 2–4 ≈ US$ 170 equivalentes).
3. `mwdx estrategia` e revisar `/portfolio`.

## Pendências e observações

- **Custo**: US$ 2,30–4,20 equivalentes por repo (5–8 min); com container,
  tilapia ficou em US$ 3,60 (sem aumento relevante). O baseline de 65
  repos não vazios fica perto de US$ 200 no limite da assinatura. Começar pelos
  ativos.
- **Qualidade**: só o auditor valida (decisão consciente). O motivo de cada
  "ignorar" fica em `achado_eventos`. Se os insights ficarem genéricos, esses
  dados servem de base para um eval.
- `mwdx preparar` e o comando manual do README servem só para depurar o plugin
  sem banco.
