"use client";

import { useState } from "react";

import { QuickMomentRecord } from "./quick-moment-record";
import { RecentMoments } from "./recent-moments";
import { HomeDate } from "./home-date";
import { LifePortal } from "./life-portal";
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
          <LifePortal />
        </div>
      </div>
    </main>
  );
}
