"use client";

import { useState } from "react";

import { QuickMomentRecord } from "./quick-moment-record";
import { RecentMoments } from "./recent-moments";

export function HomePage() {
  const [recentRevision, setRecentRevision] = useState(0);

  return (
    <main className="home-page">
      <QuickMomentRecord onSaved={() => setRecentRevision((current) => current + 1)} />
      <RecentMoments refreshKey={recentRevision} />
    </main>
  );
}
