import { memo, useCallback } from "react";
import { HardDrive, Bookmark } from "lucide-react";
import AccountPanel from "./AccountPanel";
import { SearchBox } from "./SearchBox";
import type { View } from "../types";
import BrandMark from "./BrandMark";

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
      <button className="brand-inline" onClick={() => onNavigate("today")} aria-label="На главную «KWINI MARKET»">
        <BrandMark />
        <span>Kwini Market</span>
      </button>
      <SearchBox onCommit={onCommit} />
      <div className="top-actions">
        <AccountPanel />
        <button className="chip-count download-count" onClick={() => onNavigate("installed")} aria-label="Открыть историю загрузок">
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
