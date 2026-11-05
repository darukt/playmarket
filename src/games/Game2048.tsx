import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Trophy, Undo2, Volume2, VolumeX, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { clatter, chime, blip, soundMuted, setSoundMuted } from "./sound";
import { move, canMove, readBest, persistBest, isEditingTarget } from "./logic";

const SIZE = 4;
const BEST_KEY = "pm-2048-best";
const BLANK = (): (number | null)[] => Array(SIZE * SIZE).fill(null);
const rand = (max: number) => Math.floor(Math.random() * max);

function addTile(board: (number | null)[]): (number | null)[] {
  const empty = board.map((v, i) => (v === null ? i : -1)).filter((i) => i !== -1);
  if (empty.length === 0) return board;
  const next = [...board];
  next[empty[rand(empty.length)]] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function freshBoard(): (number | null)[] {
  return addTile(addTile(BLANK()));
}

export default function Game2048({ onGameOver }: { onGameOver?: (score: number) => void }) {
  const [board, setBoard] = useState<(number | null)[]>(() => freshBoard());
  const boardRef = useRef<(number | null)[]>(board);

  const scoreRef = useRef(0);
  const wonShownRef = useRef(false);
  const blockedRef = useRef(false);
  const [score, setScore] = useState(0);
  const [history, setHistory] = useState<{ board: (number | null)[]; score: number } | null>(null);
  const [muted, setMuted] = useState(soundMuted());
  const [won, setWon] = useState(false);
  const [over, setOver] = useState(false);
  const [best, setBest] = useState(() => readBest(BEST_KEY));
  const [slide, setSlide] = useState<"left" | "right" | "up" | "down" | null>(null);
  const [moveSeq, setMoveSeq] = useState(0);
  useEffect(() => { persistBest(BEST_KEY, best); }, [best]);

  const maxTile = board.reduce<number>((m, v) => (v && v > m ? v : m), 2);
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const moveDir = useCallback((dir: "left" | "right" | "up" | "down") => {
    if (blockedRef.current) return;
    const current = boardRef.current;
    const result = move(current, dir);
    if (!result.changed) return;

    setHistory({ board: current, score: scoreRef.current });

    const withTile = addTile(result.next);
    boardRef.current = withTile;
    setBoard(withTile);
    setSlide(dir);
    setMoveSeq((n) => n + 1);
    if (result.gained > 0) clatter();
    else blip(320, 0.03, "sine", 0.03);

    const ns = scoreRef.current + result.gained;
    scoreRef.current = ns;
    setScore(ns);
    setBest((prev) => Math.max(prev, ns));

    const wonNow = !wonShownRef.current && withTile.some((v) => v !== null && v >= 2048);
    if (wonNow) {
      wonShownRef.current = true;
      blockedRef.current = true;
      setWon(true);
      chime();
    }
    const lost = !canMove(withTile);
    if (lost) {
      blockedRef.current = true;
      setOver(true);
    }
    if ((wonNow || lost) && ns > 0) onGameOver?.(ns);
  }, [onGameOver]);

  const undo = useCallback(() => {
    if (!history) return;
    boardRef.current = history.board;
    scoreRef.current = history.score;
    setBoard(history.board);
    setScore(history.score);
    blockedRef.current = false;
    setWon(false);
    setOver(false);
    setHistory(null);
    setSlide(null);
    blip(480, 0.04, "triangle", 0.04);
  }, [history]);

  const restart = useCallback(() => {
    const next = freshBoard();
    boardRef.current = next;
    scoreRef.current = 0;
    wonShownRef.current = false;
    blockedRef.current = false;
    setBoard(next);
    setScore(0);
    setHistory(null);
    setWon(false);
    setOver(false);
    setSlide(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const map: Record<string, "left" | "right" | "up" | "down"> = {
        arrowleft: "left", a: "left", ф: "left",
        arrowright: "right", d: "right", в: "right",
        arrowup: "up", w: "up", ц: "up",
        arrowdown: "down", s: "down", ы: "down",
      };
      if (map[k]) {
        e.preventDefault();
        moveDir(map[k]);
      } else if (k === "z" || k === "я") {
        e.preventDefault();
        undo();
      } else if (k === "r" || k === "к") {
        restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveDir, undo, restart]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current;
    touchRef.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 28 && Math.abs(dy) < 28) return;
    moveDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    touchRef.current = null;
  };

  const toggleMute = () => {
    const next = !muted;
    setSoundMuted(next);
    setMuted(next);
  };

  return (
    <div className="game-shell">
      <div className="game-hud" aria-label="Счёт">
        <span>СЧЁТ <b key={score} className="hud-num hud-pop">{score}</b></span>
        <span>РЕКОРД <b key={best} className="hud-num">{best}</b></span>
        <span>МАКС <b>{maxTile}</b></span>
        <button className="hud-icon" onClick={toggleMute} aria-label={muted ? "Включить звук" : "Выключить звук"} aria-pressed={!muted}>
          {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
        </button>
      </div>

      <div className="g2048-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touchRef.current = null; }}>
        <div key={moveSeq} className={`g2048-board${slide ? ` slide-${slide}` : ""}`} role="grid" aria-label="Игровое поле 2048" aria-rowcount={4} aria-colcount={4}>
          {Array.from({ length: SIZE }, (_, row) => <div className="g2048-row" role="row" key={row}>
          {Array.from({ length: SIZE }, (_, column) => {
            const i = row * SIZE + column;
            const v = board[i];
            return (
              <div key={v === null ? `e-${i}` : `c-${i}-${v}`} className={`g2048-cell${v ? ` has v${Math.min(v, 8192)} tile-pop` : ""}`} role="gridcell" aria-label={v ? String(v) : "Пусто"}>
                {v ?? ""}
              </div>
            );
          })}
          </div>)}
        </div>

        {won && !over && (
          <div className="game-overlay game-overlay-panel" role="status">
            <Trophy size={40} aria-hidden="true" className="overlay-trophy" />
            <span className="overlay-title">2048!</span>
            <span className="overlay-sub">Победа со счётом {score}. Можно собирать 4096 дальше.</span>
            <button className="overlay-cta overlay-btn" onClick={() => { blockedRef.current = false; setWon(false); }}>ПРОДОЛЖИТЬ</button>
          </div>
        )}
        {over && (
          <div className="game-overlay game-overlay-panel" role="dialog" aria-modal="true" aria-label="Ходов нет">
            <span className="overlay-title">ХОДОВ НЕТ</span>
            <span className="overlay-sub">Итоговый счёт {score} · макс. плитка {maxTile}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {history && (
                <button className="overlay-cta overlay-btn" onClick={undo}>
                  <Undo2 size={16} aria-hidden="true" /> ШАГ НАЗАД · Z
                </button>
              )}
              <button className="overlay-cta overlay-btn" onClick={restart}>
                <RotateCcw size={16} aria-hidden="true" /> ЕЩЁ РАЗ · R
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="game-foot">
        <button className="btn btn-ghost btn-sm" onClick={undo} disabled={!history}>
          <Undo2 size={12} aria-hidden="true" /> Шаг назад · Z
        </button>
        <button className="btn btn-ghost btn-sm" onClick={restart}>
          <RotateCcw size={12} aria-hidden="true" /> Новая партия · R
        </button>
      </div>

      <div className="dpad" aria-label="Управление сдвигом">
        <button className="dpad-btn dpad-up" onClick={() => moveDir("up")} aria-label="Сдвинуть вверх"><ChevronUp size={22} aria-hidden="true" /></button>
        <button className="dpad-btn dpad-left" onClick={() => moveDir("left")} aria-label="Сдвинуть влево"><ChevronLeft size={22} aria-hidden="true" /></button>
        <button className="dpad-btn dpad-center" onClick={undo} disabled={!history} aria-label="Отменить ход"><Undo2 size={18} aria-hidden="true" /></button>
        <button className="dpad-btn dpad-right" onClick={() => moveDir("right")} aria-label="Сдвинуть вправо"><ChevronRight size={22} aria-hidden="true" /></button>
        <button className="dpad-btn dpad-down" onClick={() => moveDir("down")} aria-label="Сдвинуть вниз"><ChevronDown size={22} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
