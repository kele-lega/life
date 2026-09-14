export interface NativeOverlayState {
  dialogOpen: boolean;
  photoOpen: boolean;
  writerOpen: boolean;
  appendEditorOpen: boolean;
  diaryEditorOpen: boolean;
}

export type NativeBackAction =
  | "dismiss-dialog"
  | "dismiss-photo"
  | "cancel-writer"
  | "cancel-append"
  | "cancel-diary-editor"
  | "history-back"
  | "minimize";

export function inspectNativeOverlays(root: ParentNode): NativeOverlayState {
  return {
    dialogOpen: Boolean(root.querySelector("dialog[open]")),
    photoOpen: Boolean(root.querySelector(".ui-photo-viewer-backdrop")),
    writerOpen: Boolean(root.querySelector(".quick-record[data-recording='true']")),
    appendEditorOpen: Boolean(root.querySelector(".append-editor")),
    diaryEditorOpen: Boolean(root.querySelector(".diary-editor")),
  };
}

export function resolveNativeBackAction(
  overlays: NativeOverlayState,
  canGoBack: boolean,
): NativeBackAction {
  if (overlays.dialogOpen) return "dismiss-dialog";
  if (overlays.photoOpen) return "dismiss-photo";
  if (overlays.writerOpen) return "cancel-writer";
  if (overlays.appendEditorOpen) return "cancel-append";
  if (overlays.diaryEditorOpen) return "cancel-diary-editor";
  if (canGoBack) return "history-back";
  return "minimize";
}