import type { ReactNode } from "react";

export function EmptyState({ children, icon, className = "" }: { children: ReactNode; icon: ReactNode; className?: string }) {
  return <div className={`ui-empty ${className}`}><span className="ui-empty-icon" aria-hidden="true">{icon}</span><p>{children}</p></div>;
}
