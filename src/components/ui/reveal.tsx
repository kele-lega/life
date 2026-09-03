"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motionDistance, revealTransition } from "./motion";

/** Measure the real content height; never cap or truncate the user's writing. */
export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open ? <RevealContent>{children}</RevealContent> : null}
    </AnimatePresence>
  );
}

function RevealContent({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const present = useIsPresent();
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    if (typeof ResizeObserver === "undefined") {
      const frame = requestAnimationFrame(() => setHeight(content.getBoundingClientRect().height));
      return () => cancelAnimationFrame(frame);
    }
    // Observe the intrinsic content, not the animated outer box. No per-frame reads.
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.borderBoxSize?.[0]?.blockSize ?? content.getBoundingClientRect().height;
      setHeight((previous) => Math.abs(previous - next) < 0.5 ? previous : next);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  return (
    <motion.div
      className="ui-reveal"
      inert={!present}
      aria-hidden={!present || undefined}
      initial={reducedMotion ? false : { height: 0, opacity: 0, y: -motionDistance.reveal }}
      animate={{ height, opacity: 1, y: 0 }}
      exit={{ height: 0, opacity: 0, y: reducedMotion ? 0 : -motionDistance.reveal }}
      transition={reducedMotion ? { duration: 0 } : revealTransition}
    >
      <div ref={contentRef}>{children}</div>
    </motion.div>
  );
}
