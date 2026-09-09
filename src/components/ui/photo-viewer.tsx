"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Cross2Icon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { RecordImage } from "./record-image";

interface PhotoViewerProps {
  src: string;
  alt: string;
  className?: string;
}

/** A lightweight, keyboard-accessible image viewer for local Blob URLs. */
export function PhotoViewer({ src, alt, className = "" }: PhotoViewerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    openedRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open || !openedRef.current) return;
    triggerRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <>
      <button ref={triggerRef} className={`ui-photo-trigger ${className}`} type="button" aria-label={`查看图片：${alt}`} onClick={() => setOpen(true)}>
        <RecordImage src={src} alt={alt} />
        <span className="ui-photo-trigger-icon" aria-hidden="true"><MagnifyingGlassIcon /></span>
      </button>
      {open ? createPortal((
        <div className="ui-photo-viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="ui-photo-viewer-dialog" role="dialog" aria-modal="true" aria-label={`查看图片：${alt}`}>
            <button ref={closeRef} className="ui-photo-viewer-close" type="button" aria-label="关闭图片" onClick={() => setOpen(false)}><Cross2Icon aria-hidden="true" /></button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ui-photo-viewer-image" src={src} alt={alt} decoding="async" />
          </div>
        </div>
      ), document.body) : null}
    </>
  );
}
