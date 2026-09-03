"use client";

import Link from "next/link";
import { useState } from "react";

import { QuickMomentRecord } from "./quick-moment-record";
import { RecentMoments } from "./recent-moments";
import { HomeDate } from "./home-date";
import styles from "./home-page.module.css";

export function HomePage() {
  const [recentRevision, setRecentRevision] = useState(0);

  return (
    <main className={`home-page ${styles.page}`}>
      <div className={styles.sheet}>
        <HomeDate />
        <div className={styles.content}>
          <QuickMomentRecord onSaved={() => setRecentRevision((current) => current + 1)} />
          <RecentMoments refreshKey={recentRevision} />
          <nav className="home-secondary-nav" aria-label="更多功能">
            <span>更多</span>
            <div className="home-secondary-links">
              <Link href="/timeline">时间线</Link>
              <Link href="/calendar">日历</Link>
              <Link href="/diary">日记</Link>
              <Link href="/search">搜索</Link>
            </div>
          </nav>
        </div>
      </div>
    </main>
  );
}
