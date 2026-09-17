import { isNativeApp } from "@/lib/runtime/platform";

/** Light success feedback after a real local save. Never blocks recording. */
export async function confirmSaveSuccess(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // Haptics are presentation-only.
  }
}
