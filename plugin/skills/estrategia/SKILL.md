---
name: estrategia
description: Gera a visão transversal do mwdx (padrões entre repositórios, repos a fixar no perfil e a arquivar) a partir de um run dir com resumo.json preparado pela CLI. Use quando o usuário (ou a CLI `mwdx estrategia`) pedir `/mwdx:estrategia <run_dir>`.
argument-hint: <run_dir>
---

Argumento: `$ARGUMENTS` → caminho absoluto do run dir.

1. Confirme que `<run_dir>/resumo.json` existe. Se não existir, responda que ele
   precisa ser gerado pela CLI (`mwdx estrategia`) e pare.
2. Despache o agente `estrategista-portfolio` com `run_dir`.
3. Repita a linha de resumo que ele devolver.
