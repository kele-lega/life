"use client";

import { useSyncExternalStore } from "react";

// A presentation-only local date. The server must not choose the user's timezone.
function localDay(): string {
  return new Date().toDateString();
}

function subscribe(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, 60_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

export function HomeDate() {
  const day = useSyncExternalStore(subscribe, localDay, () => "");
  const date = day ? new Date(day) : null;
  const fullDate = date?.toLocaleDateString("zh-CN", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
  const dateTime = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    : undefined;

  return (
    <header className="home-date">
      <h1 aria-label={fullDate ?? "首页"}>
        <time dateTime={dateTime}>
          {date ? <>
            <span className="date-number">{date.getMonth() + 1}</span><span className="date-unit">月</span>
            <span className="date-number">{date.getDate()}</span><span className="date-unit">日</span>
          </> : <span className="date-placeholder">今天</span>}
        </time>
      </h1>
      <p>{date?.toLocaleDateString("zh-CN", { weekday: "long" }) ?? "\u00a0"}</p>
    </header>
  );
}
