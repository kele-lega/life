"use client";

import { useImperativeHandle, useLayoutEffect, useRef, type ComponentProps } from "react";

/** CSS field-sizing where available, with a width-aware fallback for Safari. */
export function WritingTextarea({ ref: forwardedRef, ...props }: ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current!, []);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || globalThis.CSS?.supports?.("field-sizing", "content")) return;
    const resize = () => {
      const scrollY = window.scrollY;
      element.style.height = "auto";
      if (element.scrollHeight) element.style.height = `${element.scrollHeight + 2}px`;
      // Shrinking a focused input must not move the reading position.
      if (window.scrollY !== scrollY) window.scrollTo({ top: scrollY, behavior: "instant" });
    };
    resize();
    let width = element.clientWidth;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      if (width === element.clientWidth) return;
      width = element.clientWidth;
      resize();
    });
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [props.value]);
  return <textarea {...props} ref={ref} />;
}
