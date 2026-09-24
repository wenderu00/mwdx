import type { AchadoDetalhe } from "@mwdx/db";
import type { Evidencia, Execucao } from "@mwdx/schema";

// Os comandos de execucao.json rodaram no container com o repo em /work.
export function semWork(comando: string): string {
  return comando.replace(/\/work\//g, "").replace(/\/work\b/g, ".");
}

function evidencia(e: Evidencia): string {
  if ("arquivo" in e) return `- ${e.arquivo}${e.linha ? `:${e.linha}` : ""}: ${e.obs}`;
  if ("execucao" in e) return `- saída de \`${semWork(e.execucao)}\`: ${e.obs}`;
  return `- GitHub (${e.github}): ${e.obs}`;
}

// Como verificar: os comandos citados nas evidências; sem eles, o build/test/lint
// registrados na última execução.
function verificacao(achado: AchadoDetalhe, execucao: Execucao | null): string[] {
  const citados = achado.evidencias.flatMap((e) => ("execucao" in e ? [e.execucao] : []));
  const registrados = (execucao?.comandos ?? []).filter((c) => ["build", "test", "lint"].includes(c.etapa)).map((c) => c.comando);
  return [...new Set((citados.length ? citados : registrados).map(semWork))];
}

export function promptCorrecao(repo: string, achado: AchadoDetalhe, execucao: Execucao | null): string {
  const cmds = verificacao(achado, execucao);
  return [
    `No repositório ${repo}, resolva o achado ${achado.id} (${achado.dimensao}, ${achado.tipo}): ${achado.titulo}`,
    "",
    "O que fazer:",
    achado.acao,
    "",
    "Evidências:",
    ...achado.evidencias.map(evidencia),
    "",
    cmds.length
      ? ["Ao terminar, rode no repo e verifique com:", ...cmds.map((c) => `- \`${c}\``)].join("\n")
      : "Ao terminar, confira as evidências acima de novo para garantir que o problema sumiu.",
  ].join("\n");
}
