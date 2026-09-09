"use client";

import { useEffect, useState, type ReactNode } from "react";
import { db } from "@/lib/db/client";
import { LIBRARY_BOOT_KEY } from "@/lib/db/bootstrap";
import { holdDocumentLibrary, initializeControl } from "../local/control";
import { CloudAuthCallback } from "./cloud-auth-callback";

const BOOT_TIMEOUT_MS = 15_000;

export function LibraryBoundary({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      if (active) setStatus("error");
    }, BOOT_TIMEOUT_MS);
    void holdDocumentLibrary().then(() => initializeControl()).then(({ library }) => {
      if (!active || timedOut) return;
      if (db.name !== library.databaseName) {
        localStorage.setItem(LIBRARY_BOOT_KEY, library.databaseName);
        window.location.reload();
      } else setStatus("ready");
    }).catch(() => { if (active && !timedOut) setStatus("error"); }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); };
  }, []);
  if (status === "ready") return <><CloudAuthCallback />{children}</>;
  return <main className="ui-page library-boot"><span className="library-boot-mark" aria-hidden="true">Life<span>.</span></span><p role={status === "error" ? "alert" : "status"}>
    {status === "error" ? "暂时无法打开本机生活库。原始数据未被清除，请刷新重试。" : "正在打开本机生活库…"}
  </p>{status === "error" && <button className="ui-quiet-button" onClick={() => window.location.reload()}>重新打开</button>}</main>;
}
