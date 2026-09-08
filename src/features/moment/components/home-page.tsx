"use client";

import { useState } from "react";

import { QuickMomentRecord } from "./quick-moment-record";
import { RecentMoments } from "./recent-moments";
import { HomeDate } from "./home-date";
import Link from "next/link";
import { CalendarIcon, MagnifyingGlassIcon, BackpackIcon } from "@radix-ui/react-icons";
import styles from "./home-page.module.css";

export function HomePage() {
  const [recentRevision, setRecentRevision] = useState(0);

  return (
    <main className={`home-page ${styles.page}`}>
      <div className={styles.sheet}>
        <div className={styles.header}>
          <HomeDate />
        </div>
        <div className={styles.content}>
          <QuickMomentRecord onSaved={() => setRecentRevision((current) => current + 1)} />
          <RecentMoments refreshKey={recentRevision} />
        </div>
        <nav className={styles.recallNav} aria-label="浏览生活">
          <Link href="/calendar" aria-label="日历"><CalendarIcon aria-hidden="true" /></Link>
          <Link href="/search" aria-label="搜索"><MagnifyingGlassIcon aria-hidden="true" /></Link>
          <Link href="/account" aria-label="账户与备份"><BackpackIcon aria-hidden="true" /></Link>
        </nav>
      </div>
    </main>
  );
}
