"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

export function NavLink({ href, children, className = "", ...props }: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const target = typeof href === "string" ? href.split(/[?#]/)[0] : href.pathname;
  return (
    <Link {...props} href={href} className={`ui-nav-link ${className}`} aria-current={pathname === target ? "page" : undefined}>
      <span className="ui-nav-label">{children}</span>
    </Link>
  );
}
