"use client";

import { useEffect } from "react";

export function ReplicaRuntime() {
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void import("../local/push").then(({ pushReplica }) => {
        void pushReplica();
      });
    };
    run();
    const onOnline = () => run();
    window.addEventListener("online", onOnline);
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(run, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
