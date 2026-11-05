import { memo, useCallback } from "react";
import { HardDrive, Bookmark } from "lucide-react";
import AccountPanel from "./AccountPanel";
import { SearchBox } from "./SearchBox";
import type { View } from "../types";

export const TopBar = memo(function TopBar({
  onQuery,
  onNavigate,
  installedCount,
  wishlistCount,
}: {
  /** получает дебаунсированное значение — TopBar не перерендерится при каждом нажатии */
  onQuery: (v: string) => void;
  /** стабильная ссылка из родителя (useCallback) */
  onNavigate: (v: View) => void;
  installedCount: number;
  wishlistCount: number;
}) {
  const onCommit = useCallback((v: string) => onQuery(v), [onQuery]);

  return (
    <header className="topbar">
      <button className="brand-inline" onClick={() => onNavigate("today")} aria-label="На витрину Play Market">
        <svg viewBox="0 0 44 44" width="30" height="30" aria-hidden="true">
          <rect width="44" height="44" rx="9" fill="#141414" />
          <path d="M15 10 L33 22 L15 34 Z" fill="#ece8dc" />
        </svg>
        <span>PLAY MARKET</span>
      </button>
      <SearchBox onCommit={onCommit} />
      <div className="top-actions">
        <AccountPanel />
        <button className="chip-count download-count" onClick={() => onNavigate("installed")} aria-label="Открыть список установленных приложений">
          <HardDrive size={14} aria-hidden="true" />
          Загрузки <b>{installedCount}</b>
        </button>
        <button className="chip-count" onClick={() => onNavigate("wishlist")} aria-label="Открыть список желаний">
          <Bookmark size={14} aria-hidden="true" />
          <b>{wishlistCount}</b>
        </button>
      </div>
    </header>
  );
});

export default TopBar;
