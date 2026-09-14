"use client";

import { useEffect } from "react";

import { isNativeApp, isNativeWebBuild } from "@/lib/runtime/platform";

/** Registers the offline app shell without caching private API responses. */
export function PwaRegister() {
  useEffect(() => {
    if (isNativeWebBuild() || isNativeApp()) return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.storage?.persist?.().catch(() => false);
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        // Offline recording remains available through the already-open app.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
