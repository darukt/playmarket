import { ArrowUpRight, Gamepad2, Play } from "lucide-react";
import { AppLink } from "./AppLink";

export default function PortalHero() {
  return (
    <section className="portal-hero" aria-labelledby="portal-title">
      <div className="portal-copy">
        <p className="portal-intro"><Gamepad2 size={19} aria-hidden="true" /> Место для игрового перерыва</p>
        <h1 id="portal-title">Твоя точка<br />входа в игру.</h1>
        <p className="portal-description">Знакомые правила. Новые рекорды.<br />Игры, в которые можно уйти с головой — прямо в браузере.</p>
        <div className="portal-actions">
          <AppLink to={{ name: "game", slug: "razlom" }} className="portal-play"><Play size={18} fill="currentColor" aria-hidden="true" /> Играть в Разлом</AppLink>
          <AppLink to={{ name: "games" }} className="portal-browse">Выбрать игру <ArrowUpRight size={18} aria-hidden="true" /></AppLink>
        </div>
        <span className="portal-promise"><span aria-hidden="true" />Без скачивания и установки</span>
      </div>
      <div className="portal-art" aria-hidden="true">
        <svg viewBox="0 0 520 440" fill="none">
          <ellipse cx="284" cy="396" rx="173" ry="20" fill="#141414" opacity=".15" />
          <g transform="rotate(9 285 220)">
            <path d="M155 61H365L418 114V325L365 378H155L102 325V114L155 61Z" fill="#141414" />
            <path d="M158 45H368L421 98V309L368 362H158L105 309V98L158 45Z" fill="#141414" />
            <path d="M170 72H355L394 111V296L355 335H170L132 296V111L170 72Z" fill="#ffe000" />
            <path d="M177 89H348L377 118V289L348 318H177L149 289V118L177 89Z" fill="#141414" />
            <path d="M176 204H350M176 239H350M176 274H350M201 117V295M236 117V295M271 117V295M306 117V295M341 117V295" stroke="#3a3a3a" strokeWidth="1" />
            {[0, 1, 2].map(row => [0, 1, 2, 3].map(col => <rect key={`${row}-${col}`} x={170 + col * 47} y={112 + row * 30} width="39" height="21" rx="5" fill={row === 0 ? "#ece8dc" : row === 1 ? "#ffe000" : "#ff3a44"} />))}
            <path d="M205 284L288 219L258 190" stroke="#ff3a44" strokeWidth="3" strokeDasharray="5 7" strokeLinecap="round" />
            <circle cx="288" cy="219" r="10" fill="#ece8dc" />
            <rect x="178" y="287" width="82" height="12" rx="6" fill="#ff3a44" />
            <path d="M252 58H274M252 349H274" stroke="#ffe000" strokeWidth="4" strokeLinecap="round" />
          </g>
          <g transform="rotate(-14 97 301)">
            <rect x="40" y="252" width="100" height="100" rx="24" fill="#141414" />
            <rect x="40" y="242" width="100" height="100" rx="24" fill="#ff3a44" />
            <text x="90" y="304" fill="#141414" textAnchor="middle" fontFamily="Archivo Black, sans-serif" fontSize="27" fontWeight="700">2048</text>
          </g>
          <g transform="rotate(15 427 78)">
            <rect x="383" y="30" width="88" height="88" rx="23" fill="#141414" />
            <path d="M404 91V52H426V72H448" stroke="#00f076" strokeWidth="14" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx="449" cy="48" r="6" fill="#ff3a44" />
            <circle cx="452" cy="70" r="1.6" fill="#141414" />
          </g>
          <path d="M75 128V150M64 139H86M448 300V320M438 310H458" stroke="#141414" strokeWidth="5" strokeLinecap="round" />
          <circle cx="65" cy="208" r="5" fill="#141414" />
          <circle cx="446" cy="214" r="5" fill="#ff3a44" />
        </svg>
        <span className="portal-art-caption">Ещё одна попытка?</span>
      </div>
    </section>
  );
}
