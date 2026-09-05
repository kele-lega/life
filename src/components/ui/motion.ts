import type { Transition } from "framer-motion";
import type { CSSProperties } from "react";

// One source for CSS and Motion. Durations are seconds; feedback is not a save delay.
export const motionEase = [0.22, 1, 0.36, 1] as const;
export const motionDuration = { instant: 0.12, fast: 0.18, normal: 0.32, slow: 0.46 } as const;
export const motionDistance = { page: 6, content: 6, reveal: 4, button: 3, hover: 1 } as const;
export const motionStagger = { home: 0.045, list: 0.035, maxIndex: 4 } as const;
export const saveFeedbackMs = 1100;

export const contentTransition: Transition = { duration: motionDuration.normal, ease: motionEase };
export const revealTransition: Transition = {
  height: { type: "spring", duration: motionDuration.normal, bounce: 0 },
  opacity: { duration: motionDuration.fast, ease: motionEase },
  y: { duration: motionDuration.normal, ease: motionEase },
};

// Written during SSR, so CSS motion never waits for hydration to get its values.
export const motionCssVariables: CSSProperties & Record<`--${string}`, string> = {
  "--ease-soft": `cubic-bezier(${motionEase.join(",")})`,
  "--motion-instant": `${motionDuration.instant}s`,
  "--motion-fast": `${motionDuration.fast}s`,
  "--motion-normal": `${motionDuration.normal}s`,
  "--motion-enter": `${motionDuration.normal}s`,
  "--motion-slow": `${motionDuration.slow}s`,
  "--motion-page-y": `${motionDistance.page}px`,
  "--motion-content-y": `${motionDistance.content}px`,
  "--motion-hover-y": `${-motionDistance.hover}px`,
  "--motion-home-step": `${motionStagger.home}s`,
};
