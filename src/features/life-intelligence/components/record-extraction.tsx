"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { RecordExtractionSourceRef } from "../application/record-extraction-source";
import { RecordExtractionDialog } from "./record-extraction-dialog";
import styles from "./record-extraction.module.css";

/** Merely rendering or opening this entry never starts a model request. */
export function RecordExtraction({ source }: { source: RecordExtractionSourceRef }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  return <>
    <button ref={triggerRef} className={`record-extraction-trigger ${styles.trigger}`} type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>整理</button>
    {open ? createPortal(<RecordExtractionDialog source={source} onClose={close} />, document.body) : null}
  </>;
}
