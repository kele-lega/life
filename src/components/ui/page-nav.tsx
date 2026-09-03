import { NavLink } from "./nav-link";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import type { MouseEventHandler, ReactNode } from "react";

export function PageNav({ label, children }: { label: string; children: ReactNode }) {
  return <nav className="ui-page-nav" aria-label={label}>{children}</nav>;
}

export function BackLink({ href, children, onClick }: { href: string; children: ReactNode; onClick?: MouseEventHandler<HTMLAnchorElement> }) {
  return <NavLink href={href} onClick={onClick}><ArrowLeftIcon className="ui-icon" aria-hidden="true" />{children}</NavLink>;
}
