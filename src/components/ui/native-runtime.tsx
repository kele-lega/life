"use client";

import { useEffect } from "react";

import { isNativeApp, isNativeWebBuild } from "@/lib/runtime/platform";

/** Capacitor shell only. Never mounts record state or intercepts Dexie. */
export function NativeRuntime() {
  useEffect(() => {
    if (!isNativeWebBuild() && !isNativeApp()) return;
    void import("@/lib/native/app-runtime").then(({ startNativeRuntime }) => {
      void startNativeRuntime();
    });
  }, []);
  return null;
}
