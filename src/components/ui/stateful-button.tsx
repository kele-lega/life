"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** false means validation/save failed; a callback completes presentation after feedback. */
export type StatefulButtonResult = false | void | (() => void);

interface StatefulButtonProps {
  label: string;
  loadingLabel?: string;
  disabled?: boolean;
  onAction: () => Promise<StatefulButtonResult>;
}

export function StatefulButton({ label, loadingLabel = "保存中…", disabled = false, onAction }: StatefulButtonProps) {
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const reducedMotion = useReducedMotion();
  const busy = useRef(false);
  const mounted = useRef(false);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    mounted.current = true;
    const pending = timeouts.current;
    return () => {
      mounted.current = false;
      pending.forEach(clearTimeout);
      pending.length = 0;
    };
  }, []);

  async function run(): Promise<void> {
    if (disabled || busy.current) return;
    busy.current = true;
    setPhase("loading");
    let result: StatefulButtonResult;
    try {
      // No simulated loading delay: success can only follow the real operation.
      result = await onAction();
    } catch {
      // The feature owns its error message and retained inputs, not the button.
      result = false;
    }
    if (!mounted.current) return;
    if (result === false) {
      busy.current = false;
      setPhase("idle");
      return;
    }
    setPhase("done");
    const finish = result;
    timeouts.current.push(setTimeout(() => {
      timeouts.current.length = 0;
      if (!mounted.current) return;
      busy.current = false;
      setPhase("idle");
      if (typeof finish === "function") finish();
    }, 1500));
  }

  return (
    <motion.button
      type="button"
      tabIndex={0}
      className="sb:relative sb:inline-flex sb:h-11 sb:min-w-[104px] sb:shrink-0 sb:items-center sb:justify-center sb:overflow-hidden sb:rounded-lg sb:border sb:border-solid sb:border-white/20 sb:bg-zinc-950 sb:px-7 sb:py-0 sb:font-sans sb:text-sm sb:leading-5 sb:font-bold sb:whitespace-nowrap sb:text-white sb:opacity-100 sb:transition-colors sb:enabled:hover:bg-zinc-800 sb:focus-visible:outline-2 sb:focus-visible:outline-offset-4 sb:focus-visible:outline-zinc-500 sb:disabled:cursor-default"
      disabled={disabled || phase !== "idle"}
      aria-label={phase === "loading" ? loadingLabel : label}
      aria-busy={phase === "loading"}
      data-phase={phase}
      layout={!reducedMotion}
      transition={{ layout: { type: "spring", stiffness: 500, damping: 32 } }}
      whileTap={reducedMotion || phase !== "idle" || disabled ? undefined : { scale: 0.96 }}
      onClick={() => void run()}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={phase}
          className="sb:inline-flex sb:items-center sb:justify-center sb:gap-2"
          aria-hidden="true"
          initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.6 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          {phase === "loading" ? (
            <motion.span
              className="sb:block sb:h-4 sb:w-4 sb:rounded-full sb:border-2 sb:border-solid sb:border-white/25 sb:border-t-white"
              animate={reducedMotion ? undefined : { rotate: 360 }}
              transition={{ duration: 0.8, ease: "linear", repeat: Infinity }}
            />
          ) : (
            <>
              {phase === "done" ? (
                <svg className="sb:block sb:h-4 sb:w-4" viewBox="0 0 16 16" fill="none">
                  <motion.path
                    d="M 3 8.5 L 6.5 12 L 13 4.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: reducedMotion ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: reducedMotion ? 0 : 0.5 }}
                  />
                </svg>
              ) : null}
              {label}
            </>
          )}
        </motion.span>
      </AnimatePresence>
      <span className="sb:sr-only" role="status" aria-live="polite" aria-atomic="true">
        {phase === "loading" ? loadingLabel : phase === "done" ? "已保存" : ""}
      </span>
    </motion.button>
  );
}
