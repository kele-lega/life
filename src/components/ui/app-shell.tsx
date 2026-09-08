"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, ClockIcon, LayersIcon, MagnifyingGlassIcon, Pencil2Icon, ReaderIcon } from "@radix-ui/react-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./app-shell.module.css";

const destinations = [
  { href: "/", label: "记录", Icon: Pencil2Icon },
  { href: "/diary", label: "日记", Icon: ReaderIcon },
  { href: "/timeline", label: "时间线", mobileLabel: "回看", Icon: ClockIcon },
  { href: "/calendar", label: "日历", Icon: CalendarIcon },
  { href: "/search", label: "搜索", Icon: MagnifyingGlassIcon },
  { href: "/life", label: "生活地图", Icon: LayersIcon },
] as const;

function DesktopRail({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerInside = useRef(false);

  function cancelClose() {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }

  function reveal() {
    cancelClose();
    setOpen(true);
  }

  function dismiss(returnFocus = false) {
    cancelClose();
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
    setOpen(false);
  }

  function scheduleClose() {
    cancelClose();
    if (pointerInside.current || railRef.current?.contains(document.activeElement)) return;
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1100px)");
    const reset = () => {
      if (desktop.matches) return;
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
      closeTimer.current = null;
      pointerInside.current = false;
      setOpen(false);
    };
    desktop.addEventListener("change", reset);
    return () => {
      desktop.removeEventListener("change", reset);
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <div className={styles.desktopDock} data-desktop-dock data-open={open}
      onPointerEnter={(event) => { if (event.pointerType !== "touch") { pointerInside.current = true; reveal(); } }}
      onPointerLeave={() => { pointerInside.current = false; scheduleClose(); }}
      onFocusCapture={cancelClose}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) scheduleClose(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) { event.preventDefault(); dismiss(true); }
      }}>
      <button ref={triggerRef} className={styles.edgeTrigger} type="button" aria-label="显示主导航"
        aria-expanded={open} aria-controls="desktop-navigation"
        onClick={() => {
          reveal();
          requestAnimationFrame(() => railRef.current?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true }));
        }} />
      <aside ref={railRef} className={styles.rail} inert={!open} aria-hidden={!open}>
        <Link href="/" className={styles.brand} aria-label="Life 首页" onClick={() => dismiss()}>Life<span aria-hidden="true">.</span></Link>
        <nav id="desktop-navigation" aria-label="主导航" className={styles.desktopNav}>
          {destinations.map(({ href, label, Icon }) => (
            <Link key={href} href={href} onClick={() => dismiss()}
              aria-current={pathname === href || (href === "/diary" && pathname.startsWith("/diary/")) ? "page" : undefined}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
        </nav>
      </aside>
    </div>
  );
}

/** Navigation only. Records and drafts stay owned by their existing route components. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/lab/")) return <div id="main-content" tabIndex={-1}>{children}</div>;
  const active = (href: string, mobile = false) => pathname === href
    || (href === "/diary" && pathname.startsWith("/diary/"))
    || (mobile && href === "/timeline" && ["/calendar", "/search"].includes(pathname));
  return (
    <div className={styles.shell}>
      <DesktopRail pathname={pathname} />
      <div className={`app-content ${styles.content}`}>
        <div id="main-content" tabIndex={-1}>{children}</div>
      </div>
      <nav aria-label="底部导航" className={styles.mobileNav}>
        {destinations.filter(({ href }) => !["/calendar", "/search"].includes(href)).map((destination) => (
          <Link key={destination.href} href={destination.href} aria-current={active(destination.href, true) ? "page" : undefined}>
            <destination.Icon aria-hidden="true" />
            <span>{"mobileLabel" in destination ? destination.mobileLabel : destination.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
