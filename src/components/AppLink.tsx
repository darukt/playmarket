import type { MouseEvent, ReactNode } from "react";
import { pathFor, type Route } from "../nav";

export function AppLink({
  to,
  className,
  children,
  ariaLabel,
}: {
  to: Route;
  className?: string;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const href = pathFor(to);

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    window.history.pushState({ route: to }, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <a href={href} className={className} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
