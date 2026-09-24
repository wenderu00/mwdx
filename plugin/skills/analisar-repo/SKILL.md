---
name: analisar-repo
description: Analisa um repositório com o mwdx (higiene, arquitetura e portfólio, com auditoria) a partir de um run dir preparado pela CLI. Use quando o usuário (ou a CLI `mwdx scan`) pedir `/mwdx:analisar-repo <repo> <run_dir>`.
argument-hint: <repo> <run_dir>
---

Argumentos: `$ARGUMENTS` → primeiro o nome do repo, depois o caminho absoluto do
run dir.

1. Confirme que `<run_dir>/contexto.json` e `<run_dir>/work/` existem. Se não
   existirem, responda que o run dir precisa ser preparado pela CLI
   (`mwdx preparar <repo>` ou `mwdx scan <repo>`) e pare.
2. Despache o agente `analisador-repo` com `repo` e `run_dir`. Não analise nada
   você mesmo.
3. Repita como resposta final o bloco `MWDX_RESUMO` que o agente devolver,
   sem alterá-lo.
