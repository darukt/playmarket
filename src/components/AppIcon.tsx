import { useState } from "react";
import type { CatalogApp } from "../data/apps";

function initials(name: string): string {
  const words = name
    .replace(/[^A-Za-zА-Яа-яЁё0-9 ]/g, "")
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default function AppIcon({
  app,
  size,
  className = "",
}: {
  app: CatalogApp;
  size: "sm" | "md" | "lg";
  className?: string;
}) {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const failed = failedFor === app.id;
  if (failed) {
    const fg = app.ink === "light" ? "#ffffff" : "#141414";
    return (
      <div
        className={`app-icon sz-${size} ${className}`}
        style={{ background: app.color, color: fg }}
        aria-hidden="true"
      >
        <span>{initials(app.name)}</span>
      </div>
    );
  }
  const iconSrc = app.icon || `/media/${app.id}/icon.webp`;
  return (
    <img
      className={`app-icon-img sz-${size} ${className}`}
      src={iconSrc}
      alt={`Иконка ${app.name}`}
      width={256}
      height={256}
      loading="lazy"
      onError={() => setFailedFor(app.id)}
    />
  );
}
