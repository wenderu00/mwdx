#!/usr/bin/env bash
# Executa um comando no container da análise e imprime um rodapé parseável.
# Uso: exec-container.sh <container mwdx-*> '<comando>' [timeout_s=600]
# Rodapé: "__mwdx exit=<n|timeout> dur=<segundos>" — exit=timeout vira exit_code null.
set -u
container="${1:?container}"
comando="${2:?comando}"
limite="${3:-600}"

case "$container" in
  mwdx-*) ;;
  *) echo "recusado: só containers mwdx-*" >&2; exit 64 ;;
esac

saida="$(mktemp)"
trap 'rm -f "$saida"' EXIT
inicio=$SECONDS
timeout "$limite" docker exec "$container" sh -lc "$comando" >"$saida" 2>&1
codigo=$?
dur=$((SECONDS - inicio))
[ "$codigo" -eq 124 ] && codigo=timeout

linhas=$(wc -l <"$saida")
if [ "$linhas" -gt 120 ]; then
  head -n 20 "$saida"
  echo "... ($((linhas - 80)) linhas omitidas) ..."
  tail -n 60 "$saida"
else
  cat "$saida"
fi
echo "__mwdx exit=$codigo dur=$dur"
