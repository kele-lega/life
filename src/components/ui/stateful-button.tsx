"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { motionDistance, motionDuration, motionEase, saveFeedbackMs } from "./motion";

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
  const [failed, setFailed] = useState(false);
  const reducedMotion = useReducedMotion();
  const busy = useRef(false);
  const mounted = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      if (timeout.current !== null) clearTimeout(timeout.current);
      timeout.current = null;
    };
  }, []);

  async function run(): Promise<void> {
    if (disabled || busy.current) return;
    const current = ++generation.current;
    if (timeout.current !== null) clearTimeout(timeout.current);
    timeout.current = null;
    busy.current = true;
    setFailed(false);
    setPhase("loading");
    let result: StatefulButtonResult;
    let rejected = false;
    try {
      // No simulated loading delay: success can only follow the real operation.
      result = await onAction();
    } catch {
      // Returned false is feature-owned validation; unexpected rejection also gets live feedback.
      rejected = true;
      result = false;
    }
    if (!mounted.current || current !== generation.current) return;
    if (result === false) {
      busy.current = false;
      setFailed(rejected);
      setPhase("idle");
      return;
    }
    setPhase("done");
    const finish = result;
    timeout.current = setTimeout(() => {
      timeout.current = null;
      if (!mounted.current || current !== generation.current) return;
      busy.current = false;
      setPhase("idle");
      if (typeof finish === "function") finish();
    }, saveFeedbackMs);
  }

  const currentLabel = phase === "loading" ? loadingLabel : phase === "done" ? "已保存" : label;

  return (
    <motion.button
      type="button"
      tabIndex={0}
      className="stateful-button"
      disabled={disabled || phase !== "idle"}
      aria-label={currentLabel}
      aria-busy={phase === "loading"}
      data-phase={phase}
      transition={{ duration: reducedMotion ? 0 : motionDuration.instant, ease: motionEase }}
      whileTap={reducedMotion || phase !== "idle" || disabled ? undefined : { scale: 0.98 }}
      onClick={() => void run()}
    >
      <span className="stateful-button-size" aria-hidden="true">
        <span>{label}</span>
        <span><span className="stateful-button-icon-space" />{loadingLabel}</span>
        <span><span className="stateful-button-icon-space" />已保存</span>
      </span>
      <AnimatePresence initial={false}>
        <motion.span
          key={phase}
          className="stateful-button-content"
          aria-hidden="true"
          initial={reducedMotion ? false : { opacity: 0, y: motionDistance.button }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reducedMotion ? 0 : -motionDistance.button }}
          transition={{ duration: reducedMotion ? 0 : motionDuration.instant, ease: motionEase }}
        >
          {phase === "loading" ? (
            <span className="stateful-button-spinner sb:block sb:h-4 sb:w-4 sb:rounded-full sb:border-2 sb:border-solid sb:border-white/25 sb:border-t-white" />
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
                    transition={{ duration: reducedMotion ? 0 : motionDuration.fast, ease: motionEase }}
                  />
                </svg>
              ) : null}
            </>
          )}
          {currentLabel}
        </motion.span>
      </AnimatePresence>
      <span className="sb:sr-only" role="status" aria-live="polite" aria-atomic="true">
        {phase === "loading" ? loadingLabel : phase === "done" ? "已保存" : ""}
      </span>
      {failed ? <span className="visually-hidden" role="alert">保存失败，请重试。</span> : null}
    </motion.button>
  );
}
