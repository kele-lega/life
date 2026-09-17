"use client";

import { useEffect } from "react";

export function ReplicaRuntime() {
  useEffect(() => {
    let cancelled = false;
    const run = (forceRetry = false) => {
      if (cancelled) return;
      void import("../client/account").then(async ({ retryReplicaLogout }) => {
        await retryReplicaLogout();
        if (cancelled) return;
        const { pushReplica } = await import("../local/push");
        if (!cancelled) await pushReplica(undefined, undefined, { forceRetry });
      }).catch(() => { /* Local records remain usable while revocation/network is unavailable. */ });
    };
    run();
    const onOnline = () => run(true);
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
