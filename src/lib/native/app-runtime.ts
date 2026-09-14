import { inspectNativeOverlays, resolveNativeBackAction } from "./back-action";
import { isNativeApp } from "@/lib/runtime/platform";

const LIGHT_SURFACE = "#fafaf9";
const DARK_SURFACE = "#171a19";

function applyBackAction(canGoBack: boolean): void {
  const action = resolveNativeBackAction(inspectNativeOverlays(document), canGoBack);
  if (action === "dismiss-dialog") {
    document.querySelector("dialog[open]")?.dispatchEvent(new Event("cancel", { cancelable: true }));
    return;
  }
  if (action === "dismiss-photo") {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return;
  }
  if (action === "cancel-writer") {
    document.querySelector<HTMLButtonElement>(".quick-record[data-recording='true'] .record-actions > button")?.click();
    return;
  }
  if (action === "cancel-append") {
    document.querySelector<HTMLButtonElement>(".append-editor .append-actions > button")?.click();
    return;
  }
  if (action === "cancel-diary-editor") {
    document.querySelector<HTMLButtonElement>(".diary-actions > button")?.click();
    return;
  }
  if (action === "history-back") {
    window.history.back();
    return;
  }
  void import("@capacitor/app").then(({ App }) => App.minimizeApp());
}

async function syncStatusBar(): Promise<void> {
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  await StatusBar.setOverlaysWebView({ overlay: false });
  await StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark });
  await StatusBar.setBackgroundColor({ color: dark ? DARK_SURFACE : LIGHT_SURFACE });
}

export async function startNativeRuntime(): Promise<void> {
  if (!isNativeApp()) return;
  document.documentElement.classList.add("life-native");
  try {
    const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");
    await Keyboard.setResizeMode({ mode: KeyboardResize.None });
  } catch {
    // Keyboard plugin absence must not block local recording.
  }
  try {
    await syncStatusBar();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      void syncStatusBar();
    });
  } catch {
    // Status bar styling is presentation-only.
  }
  const { App } = await import("@capacitor/app");
  App.addListener("backButton", ({ canGoBack }) => {
    applyBackAction(canGoBack);
  });
}