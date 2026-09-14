import { describe, expect, it } from "vitest";

import { inspectNativeOverlays, resolveNativeBackAction, type NativeOverlayState } from "./back-action";

const clear: NativeOverlayState = {
  dialogOpen: false,
  photoOpen: false,
  writerOpen: false,
  appendEditorOpen: false,
  diaryEditorOpen: false,
};

describe("inspectNativeOverlays", () => {
  it("reads existing cancel surfaces", () => {
    document.body.innerHTML = [
      '<dialog open></dialog>',
      '<div class="ui-photo-viewer-backdrop"></div>',
      '<section class="quick-record" data-recording="true"></section>',
      '<div class="append-editor"></div>',
      '<section class="diary-editor"></section>',
    ].join("");
    expect(inspectNativeOverlays(document)).toEqual({
      dialogOpen: true,
      photoOpen: true,
      writerOpen: true,
      appendEditorOpen: true,
      diaryEditorOpen: true,
    });
  });
});

describe("resolveNativeBackAction", () => {
  it("maps overlays onto existing cancel paths before history", () => {
    expect(resolveNativeBackAction({ ...clear, dialogOpen: true }, true)).toBe("dismiss-dialog");
    expect(resolveNativeBackAction({ ...clear, photoOpen: true }, true)).toBe("dismiss-photo");
    expect(resolveNativeBackAction({ ...clear, writerOpen: true }, false)).toBe("cancel-writer");
    expect(resolveNativeBackAction({ ...clear, appendEditorOpen: true }, true)).toBe("cancel-append");
    expect(resolveNativeBackAction({ ...clear, diaryEditorOpen: true }, true)).toBe("cancel-diary-editor");
  });

  it("uses Capacitor canGoBack instead of history.length", () => {
    expect(resolveNativeBackAction(clear, true)).toBe("history-back");
    expect(resolveNativeBackAction(clear, false)).toBe("minimize");
  });
});