import {
  Newspaper,
  ListOrdered,
  Gamepad2,
  HardDrive,
  Bookmark,
} from "lucide-react";
import type { View } from "../types";

const NAV: { id: View; label: string; no: string; icon: typeof Newspaper }[] = [
  { id: "today", label: "Сегодня", no: "01", icon: Newspaper },
  { id: "chart", label: "Каталог", no: "02", icon: ListOrdered },
  { id: "games", label: "Игры", no: "03", icon: Gamepad2 },
  { id: "installed", label: "Мои загрузки", no: "04", icon: HardDrive },
  { id: "wishlist", label: "Список желаний", no: "05", icon: Bookmark },
];

function triangleMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 44 44" role="img" aria-label="Play Market">
      <rect width="44" height="44" rx="9" fill="#ece8dc" />
      <path d="M14 10 L34 22 L14 34 Z" fill="#141414" />
      <circle cx="13" cy="13" r="2.6" fill="#ff3a44" />
      <circle cx="13" cy="22" r="2.6" fill="#ffe000" />
      <circle cx="13" cy="31" r="2.6" fill="#00f076" />
    </svg>
  );
}

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
      <button className="brand brand-btn" onClick={() => onNavigate("today")} aria-label="Перейти на витрину Play Market">
        {triangleMark()}
        <div className="brand-text">
          <strong>PLAY<br />MARKET</strong>
          <span>игры и приложения</span>
        </div>
      </button>

      <nav aria-label="Разделы">
        <div className="nav-label">Ваша библиотека</div>
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
                ) : (
                  <Icon size={14} strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="device-box" aria-label="Состояние устройства">
        <h3>Ваша коллекция</h3>
        <p>{installedCount} в истории загрузок</p>
        <div className="storage-track" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Размер файлов относительно условных 128 ГБ">
          <div className="storage-fill" style={{ width: `${Math.max(pct, 1.5)}%` }} />
        </div>
        <div className="storage-total">
          Размер файлов: {formatStorage(usedMb)}
        </div>
      </div>
    </aside>
  );
}
