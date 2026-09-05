"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId, useRef, type KeyboardEvent } from "react";
import { motionDuration, motionEase } from "./motion";
import styles from "./segmented-control.module.css";

/** Presentation-only selection. Tabs use one Tab stop and arrow/Home/End navigation. */
export function SegmentedControl<T extends string>({
  label, options, value, onChange, className = "", tabs = false, panelId,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  tabs?: boolean;
  panelId?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!tabs) return;
    const next = event.key === "ArrowRight" ? (index + 1) % options.length
      : event.key === "ArrowLeft" ? (index + options.length - 1) % options.length
      : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    onChange(options[next].value);
    root.current?.querySelectorAll("button")[next]?.focus();
  }
  return (
    <div ref={root} className={`${styles.control} ${className}`} role={tabs ? "tablist" : "group"} aria-label={label}>
      {options.map((option, index) => (
        <button key={option.value} type="button" role={tabs ? "tab" : undefined}
          aria-selected={tabs ? value === option.value : undefined}
          aria-pressed={tabs ? undefined : value === option.value}
          aria-controls={tabs ? panelId : undefined}
          tabIndex={tabs && value !== option.value ? -1 : 0}
          onKeyDown={(event) => onKeyDown(event, index)} onClick={() => onChange(option.value)}>
          {value === option.value ? <motion.span aria-hidden="true" className={styles.selection}
            layoutId={reduced ? undefined : `${id}-selection`}
            transition={reduced ? { duration: 0 } : { duration: motionDuration.normal, ease: motionEase }} /> : null}
          <span className={styles.label}>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
