"use client";

import { useEffect, useRef, useState } from "react";
import { BackupError } from "../shared/format";
import { cloudApi } from "../client/api";
import { exclusiveLibrary, reloadLibrary, setLocalAccount } from "../local/control";

/**
 * Supabase's hosted default mailer sends a Magic Link when a custom SMTP
 * template with {{ .Token }} is not configured. Keep that provider flow
 * compatible with the same server-owned Life Session used by numeric OTP.
 * The bearer value is consumed once, never stored or logged, and removed from
 * the address bar before any navigation.
 */
export function CloudAuthCallback() {
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current || typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get("access_token");
    const type = params.get("type");
    if (!accessToken || (type && !["magiclink", "signup"].includes(type))) return;
    started.current = true;
    // Do not leave a provider token in browser history, referrers or copied URLs.
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
    void (async () => {
      try {
        const result = await cloudApi<{ account: { id: string; email: string } }>("auth/email/callback", { accessToken });
        await exclusiveLibrary(async () => reloadLibrary(await setLocalAccount(result.account)));
      } catch (cause) {
        setError(cause instanceof BackupError ? cause.message : "登录链接无效或已过期，请重新获取。登录失败不会影响本机记录。");
      }
    })();
  }, []);

  if (!error) return null;
  return <p role="alert" className="ui-page-status">{error}</p>;
}
