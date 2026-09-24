# Regras de achados do mwdx

Valem para os três especialistas (higiene, arquitetura, portfólio) e são o
critério do auditor. O formato exato está em `schemas/<dimensao>.schema.json`.

## Evidência

Todo achado e toda reconciliação precisam de pelo menos uma evidência
**verificável por outra pessoa sem refazer a análise**:

- `{"arquivo": "src/api/user.ts", "linha": 42, "obs": "..."}`: caminho relativo
  à raiz do repo (`work/`). A linha, quando informada, precisa conter o que a
  `obs` descreve. Ausência também é evidência:
  `{"arquivo": ".github/workflows/", "obs": "diretório inexistente"}`.
- `{"execucao": "<comando>", "obs": "..."}`: o comando tem que aparecer
  **literalmente** em `execucao.json → comandos[].comando`.
- `{"github": "<campo>", "obs": "..."}`: um campo de `contexto.json → github`.

A `obs` diz o que foi observado ("3 de 14 testes falham: ..."), não uma opinião.

## O que é um bom achado

- **Específico deste repo.** "Adicionar testes" é genérico; "O serviço
  `PedidoService` (regras de desconto) não tem nenhum teste, enquanto os
  controllers têm" é um achado.
- **`lacuna`** = falta algo esperado ou algo está quebrado. **`oportunidade`** =
  o projeto funciona, mas uma mudança traria retorno claro (para o código ou
  para o objetivo em `perfil.md`).
- **`acao`** concreta o bastante para virar um prompt de correção: o quê, onde e
  como verificar que ficou pronto.
- **`impacto`** 1–3 (cosmético → crítico/alto retorno) e **`esforco`** 1–3
  (< 1h → vários dias), calibrados para *este* repo.
- **No máximo 8 achados novos por dimensão.** Priorize os de maior impacto; não
  preencha a cota com trivialidades.
- **Um problema, um achado**, na dimensão certa: CI e dependências são higiene;
  acoplamento e testabilidade são arquitetura; README como vitrine e demo são
  portfólio. Na dúvida, fica na dimensão cuja ação resolve o problema.

## Reconciliação (antes de propor achados novos)

`contexto.json` traz os achados anteriores:

- `achados_ativos` da sua dimensão: reconcilie **todos**, com veredito
  `persistente` ou `resolvido` e evidência atual.
- `achados_resolvidos` da sua dimensão: só entram na reconciliação se o
  problema voltou (veredito `regrediu`).
- `ignorados`: o dono decidiu que não importam, e o `motivo` diz por quê.
  **Não os proponha de novo**, nem reformulados.
- Não crie um achado novo que duplique um ativo: se o problema mudou de forma,
  reconcilie o ativo como `persistente` e ajuste a evidência.

## Nota (0–100)

A nota resume a dimensão e precisa ser coerente com a `justificativa` e com os
achados (os ativos persistentes contam também):

- **90–100**: referência, nada relevante a apontar.
- **70–89**: sólido, com lacunas pontuais.
- **40–69**: funciona, mas com lacunas que um avaliador notaria.
- **0–39**: lacunas estruturais, ou quase nada presente.

Repos de bootcamp/disciplina são avaliados pelo mesmo padrão. A justificativa
pode reconhecer o contexto, mas a nota não é "de consolação".
