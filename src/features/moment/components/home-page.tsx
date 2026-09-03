"use client";

import { NavLink } from "@/components/ui/nav-link";
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
            <h2>更多</h2>
            <div className="home-secondary-links">
              <NavLink href="/timeline">时间线</NavLink>
              <NavLink href="/calendar">日历</NavLink>
              <NavLink href="/diary">日记</NavLink>
              <NavLink href="/search">搜索</NavLink>
            </div>
          </nav>
        </div>
      </div>
    </main>
  );
}
