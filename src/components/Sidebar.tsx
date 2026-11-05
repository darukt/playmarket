import {
  Newspaper,
  ListOrdered,
  Gamepad2,
  HardDrive,
  Bookmark,
} from "lucide-react";
import type { View } from "../types";
import BrandMark from "./BrandMark";

const NAV: { id: View; label: string; no: string; icon: typeof Newspaper }[] = [
  { id: "today", label: "Сегодня", no: "01", icon: Newspaper },
  { id: "chart", label: "Чарт", no: "02", icon: ListOrdered },
  { id: "games", label: "Игры", no: "03", icon: Gamepad2 },
  { id: "installed", label: "Мои загрузки", no: "04", icon: HardDrive },
  { id: "wishlist", label: "Список желаний", no: "05", icon: Bookmark },
];

function formatStorage(usedMb: number): string {
  if (usedMb >= 1024) return `${(usedMb / 1024).toFixed(1).replace(".", ",")} ГБ`;
  return `${usedMb} МБ`;
}

export default function Sidebar({
  current,
  onNavigate,
  installedCount,
  wishlistCount,
  usedMb,
  totalMb,
}: {
  current: View | null;
  onNavigate: (v: View) => void;
  installedCount: number;
  wishlistCount: number;
  usedMb: number;
  totalMb: number;
}) {
  const pct = Math.min(100, (usedMb / totalMb) * 100);

  return (
    <aside className="sidebar">
      <button className="brand brand-btn" onClick={() => onNavigate("today")} aria-label="На главную «Витрины»">
        <BrandMark />
        <div className="brand-text">
          <strong>ВИТРИНА</strong>
          <span>каталог приложений</span>
        </div>
      </button>

      <nav aria-label="Разделы">
        <div className="nav-label">В МОМЕНТЕ</div>
        <ul className="nav-list">
          {NAV.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                className={`nav-btn${current === id ? " active" : ""}`}
                onClick={() => onNavigate(id)}
                aria-current={current === id ? "page" : undefined}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                {label}
                {id === "installed" || id === "wishlist" ? (
                  <span className="nav-count">
                    {id === "installed" ? installedCount : wishlistCount}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="device-box" aria-label="История запросов на скачивание">
        <h3>ИСТОРИЯ ЗАПРОСОВ</h3>
        <p>{installedCount} запросов на скачивание</p>
        <div className="storage-track" aria-hidden="true">
          <div className="storage-fill" style={{ width: `${Math.max(pct, 1.5)}%` }} />
        </div>
        <div className="storage-total">
          По каталогу: ≈ {formatStorage(usedMb)}
        </div>
      </div>
    </aside>
  );
}
