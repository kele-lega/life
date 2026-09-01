"use client";

import Link from "next/link";
import { useState } from "react";

import { QuickMomentRecord } from "./quick-moment-record";
import { RecentMoments } from "./recent-moments";

export function HomePage() {
  const [recentRevision, setRecentRevision] = useState(0);

  return (
    <main className="home-page">
      <QuickMomentRecord onSaved={() => setRecentRevision((current) => current + 1)} />
      <nav className="home-secondary-nav" aria-label="更多功能">
        <Link href="/timeline">时间线</Link>
        <Link href="/calendar">日历</Link>
        <Link href="/diary">日记</Link>
        <Link href="/search">搜索</Link>
      </nav>
      <RecentMoments refreshKey={recentRevision} />
    </main>
  );
}
