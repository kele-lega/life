"use client";

import {
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  LayersIcon,
  MagnifyingGlassIcon,
  Pencil2Icon,
} from "@radix-ui/react-icons";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";

import { motionDuration, motionEase } from "@/components/ui/motion";

import styles from "./life-portal.module.css";

const destinations = [
  {
    href: "/timeline",
    label: "时间线",
    description: "沿发生的顺序回看",
    Icon: ClockIcon,
  },
  {
    href: "/calendar",
    label: "日历",
    description: "从某一天重新打开",
    Icon: CalendarIcon,
  },
  {
    href: "/search",
    label: "搜索",
    description: "循着一句话找到过去",
    Icon: MagnifyingGlassIcon,
  },
  {
    href: "/diary",
    label: "日记",
    description: "回到完整的一天",
    Icon: Pencil2Icon,
  },
  {
    href: "/life",
    label: "生活地图",
    description: "看见生活如何形成",
    Icon: LayersIcon,
  },
] as const;

const revealTransition = {
  duration: motionDuration.normal,
  ease: motionEase,
};

export function LifePortal() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <nav
      className={`home-secondary-nav ${styles.portal}`}
      aria-label="浏览生活"
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls="home-life-path"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.triggerCopy}>
          <span className={styles.eyebrow}>生活脉络</span>
          <span className={styles.triggerTitle}>从此刻，慢慢走向全部生活</span>
          <span className={styles.triggerHint}>沿着时间、日期与线索回望</span>
        </span>

        <span className={styles.signal} aria-hidden="true">
          <span className={styles.signalTrail}>
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className={styles.signalEnd}>
            <ChevronDownIcon />
          </span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="home-life-path"
            className={styles.reveal}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : revealTransition}
          >
            <div className={styles.pathCanvas}>
              <p className={styles.pathIntroduction}>
                每一种回望，都从同一段生活出发。
              </p>

              <svg
                className={styles.pathLine}
                viewBox="0 0 1000 190"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <motion.path
                  d="M 95 48 C 165 48 205 142 292 142 S 412 48 500 48 S 612 142 700 142 S 824 48 904 48"
                  initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: motionDuration.slow, ease: motionEase }}
                />
              </svg>

              <div className={styles.stops}>
                {destinations.map(({ href, label, description, Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={styles.stop}
                    data-destination={href === "/life" ? "true" : undefined}
                  >
                    <span className={styles.stopMark} aria-hidden="true">
                      <Icon />
                    </span>
                    <span className={styles.stopCopy}>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </nav>
  );
}
