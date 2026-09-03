"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/** A page-owned boundary: no pathname key, route exit delay, or persistent-layout animation. */
export function PageEntrance({ children, home = false }: { children: ReactNode; home?: boolean }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className={home ? "motion-home" : "motion-page"}>{children}</div>
    </MotionConfig>
  );
}
