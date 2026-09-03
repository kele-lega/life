"use client";

import { motion, useIsPresent, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { contentTransition, motionDistance, motionDuration, motionEase } from "./motion";

/** Stable keyed rows fade once; subsequent changes animate position without scaling text. */
export function MotionEntry({ children, className, as = "article", delay = 0, enter = true }: {
  children: ReactNode;
  className: string;
  as?: "article" | "div";
  delay?: number;
  enter?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const present = useIsPresent();
  const Element = as === "article" ? motion.article : motion.div;
  return (
    <Element
      className={className}
      inert={!present}
      aria-hidden={!present || undefined}
      layout={reducedMotion ? false : "position"}
      initial={reducedMotion || !enter ? false : { opacity: 0, y: motionDistance.content }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : motionDuration.fast, ease: motionEase } }}
      transition={reducedMotion ? { duration: 0 } : { ...contentTransition, delay, layout: contentTransition }}
    >{children}</Element>
  );
}
