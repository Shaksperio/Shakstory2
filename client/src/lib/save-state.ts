// Estados de salvamento mostrados ao escritor. Três coisas diferentes, nunca confundidas:
//  - local: o texto está guardado neste aparelho (e ainda não foi enviado);
//  - pending: aguardando a sincronização (enviando agora ou na fila);
//  - synced: a sincronização terminou para tudo o que foi escrito até agora.
// Se nem o armazenamento do navegador nem a cópia offline aceitaram a gravação, o estado é "unsaved" (aviso, nunca confirmação).

export type SaveState = "unsaved" | "conflict" | "local" | "pending" | "synced" | "idle";

export type SaveStateInput = {
  /** Nenhuma das cópias locais aceitou a última gravação (sem espaço no aparelho). */
  localLost: boolean;
  conflict: boolean;
  /** Há alterações ainda não confirmadas pela sincronização. */
  pending: boolean;
  /** Um envio está em andamento agora. */
  syncing: boolean;
  /** Sem como sincronizar neste momento: offline, modo offline escolhido, sem login ou envio que falhou. */
  stalled: boolean;
  /** Pelo menos uma sincronização já foi concluída nesta sessão (ou o servidor informou sincronizado). */
  everSynced: boolean;
};

export type SaveStateView = { state: SaveState; label: string; short: string; detail: string };

export function resolveSaveState(input: SaveStateInput): SaveStateView {
  if (input.localLost) return { state: "unsaved", label: "Não salvo", short: "Não salvo", detail: "Não há espaço neste aparelho para guardar as últimas alterações. Baixe um backup JSON em Segurança dos dados agora." };
  if (input.conflict) return { state: "conflict", label: "Conflito", short: "Conflito", detail: "Outro aparelho alterou o mesmo texto. Nada foi perdido; as diferenças serão mescladas." };
  if (input.pending && input.stalled) return { state: "local", label: "Salvo neste aparelho", short: "Local", detail: "O texto está guardado neste aparelho e será sincronizado quando houver conexão." };
  if (input.pending || input.syncing) return { state: "pending", label: input.syncing ? "Sincronizando…" : "Sincronização pendente", short: input.syncing ? "Enviando" : "Pendente", detail: "O texto já está guardado neste aparelho; a sincronização ainda não terminou." };
  if (input.everSynced) return { state: "synced", label: "Sincronização concluída", short: "Sincronizado", detail: "Tudo o que você escreveu foi sincronizado." };
  return { state: "idle", label: "Pronto para salvar", short: "Pronto", detail: "Nenhuma alteração desde que o livro foi aberto." };
}

export type LocalOutcome = "stored" | "backup-only" | "lost";

/** Resultado de guardar a biblioteca no aparelho: localStorage (síncrono) e cópia offline (assíncrona). */
export function resolveLocalOutcome(storageOk: boolean, backupOk: boolean): LocalOutcome {
  if (storageOk) return "stored";
  return backupOk ? "backup-only" : "lost";
}
