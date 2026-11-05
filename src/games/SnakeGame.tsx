import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { blip, thud, chime, soundMuted, setSoundMuted } from "./sound";
import { randomEmptyCell, snakeCollision, isEditingTarget, readBest, persistBest } from "./logic";
import { useReducedMotion, usePauseWhenHidden } from "./lifecycle";

const W = 480;
const H = 480;
const CELL = 16;
const GRID = W / CELL;
const BEST_KEY = "pm-snake-best";
const BONUS_TTL = 7500; // мс жизни золотого яблока

type Dir = { x: number; y: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string };
type Bonus = { x: number; y: number; expiresAt: number };

const UP: Dir = { x: 0, y: -1 };
const DOWN: Dir = { x: 0, y: 1 };
const LEFT: Dir = { x: -1, y: 0 };
const RIGHT: Dir = { x: 1, y: 0 };
const OPPOSITE = (a: Dir, b: Dir) => a.x === -b.x && a.y === -b.y;

export default function SnakeGame({ onGameOver }: { onGameOver?: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snakeRef = useRef<Dir[]>([{ x: 6, y: 12 }, { x: 5, y: 12 }, { x: 4, y: 12 }]);
  const dirRef = useRef<Dir>(RIGHT);
  const pendingDirRef = useRef<Dir>(RIGHT);
  const foodRef = useRef<Dir>({ x: 18, y: 12 });
  const bonusRef = useRef<Bonus | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const applesEatenRef = useRef(0);
  const scoreRef = useRef(0);
  const gameTime = useRef(0);
  const backgroundRef = useRef<HTMLCanvasElement | null>(null);
  const previousSnake = useRef<Dir[]>([]);
  const interpolation = useRef(1);
  const reducedMotion = useReducedMotion();

  const [overlay, setOverlay] = useState<"ready" | "over" | "won" | null>("ready");
  const [paused, setPaused] = useState(false);
  const [wrapWalls, setWrapWalls] = useState(false);
  const [shake, setShake] = useState(false);
  const [score, setScore] = useState(0);
  const [muted, setMuted] = useState(soundMuted());
  const [best, setBest] = useState(() => readBest(BEST_KEY));
  useEffect(() => { persistBest(BEST_KEY, best); }, [best]);
  usePauseWhenHidden(() => { if (overlay === null) setPaused(true); });

  const msPerStep = Math.max(68, 150 - score * 3);
  const speedMult = (150 / msPerStep).toFixed(1).replace(".", ",");

  const spawnBurst = useCallback((cellX: number, cellY: number, color: string, count = 12) => {
    if (reducedMotion) return;
    const cx = cellX * CELL + CELL / 2;
    const cy = cellY * CELL + CELL / 2;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const sp = 1.2 + Math.random() * 2.2;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 22 + Math.floor(Math.random() * 10),
        max: 32,
        color,
      });
    }
  }, [reducedMotion]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const now = gameTime.current;

    if (!backgroundRef.current) {
      const background = document.createElement("canvas");
      background.width = W; background.height = H;
      const grid = background.getContext("2d")!;
      grid.fillStyle = "#141414";
      grid.fillRect(0, 0, W, H);
      grid.fillStyle = "#1f1f1f";
      for (let x = CELL / 2; x < W; x += CELL) {
        for (let y = CELL / 2; y < H; y += CELL) grid.fillRect(x, y, 1.5, 1.5);
      }
      backgroundRef.current = background;
    }
    ctx.drawImage(backgroundRef.current, 0, 0);

    // particles
    const parts = particlesRef.current;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 3.5, 3.5);
    }
    ctx.globalAlpha = 1;

    // food — пульсирует
    const pulse = reducedMotion ? 1 : 1 + Math.sin(now / 320) * 0.18;
    const f = foodRef.current;
    ctx.fillStyle = "#ff3a44";
    ctx.beginPath();
    ctx.arc(f.x * CELL + CELL / 2, f.y * CELL + CELL / 2, (CELL / 2 - 2) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff8a90";
    ctx.beginPath();
    ctx.arc(f.x * CELL + CELL / 2 - 2, f.y * CELL + CELL / 2 - 2, 2.4 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // bonus golden apple
    const bonus = bonusRef.current;
    if (bonus) {
      const left = Math.max(0, bonus.expiresAt - now);
      if (left <= 0) {
        // Expiration is processed by the game step.
      } else {
        const bx = bonus.x * CELL + CELL / 2;
        const by = bonus.y * CELL + CELL / 2;
        const bp = reducedMotion ? 1 : 1 + Math.sin(now / 150) * 0.22;
        ctx.fillStyle = "#ffe000";
        ctx.beginPath();
        ctx.arc(bx, by, (CELL / 2 - 1.5) * bp, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, CELL / 2 + 2, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * left) / BONUS_TTL);
        ctx.stroke();
      }
    }

    // snake
    const len = snakeRef.current.length;
    snakeRef.current.forEach((cell, i) => {
      const previous = previousSnake.current[i] ?? cell;
      const alpha = reducedMotion ? 1 : interpolation.current;
      const canInterpolate = Math.abs(cell.x - previous.x) <= 1 && Math.abs(cell.y - previous.y) <= 1;
      const seg = canInterpolate ? { x: previous.x + (cell.x - previous.x) * alpha, y: previous.y + (cell.y - previous.y) * alpha } : cell;
      const head = i === 0;
      const tailRatio = 1 - (i / Math.max(1, len)) * 0.35;
      ctx.fillStyle = head ? "#a6ff7a" : i % 2 === 0 ? "#00f076" : "#00d466";
      ctx.globalAlpha = head ? 1 : tailRatio;
      const inset = head ? 1 : 2;
      const r = head ? 5 : 4;
      const x = seg.x * CELL + inset;
      const y = seg.y * CELL + inset;
      const s = CELL - inset * 2;
      ctx.beginPath();
      ctx.roundRect(x, y, s, s, r);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (head) {
        ctx.fillStyle = "#141414";
        const d = dirRef.current;
        const e = CELL / 2;
        const eye = (ox: number, oy: number) => {
          ctx.beginPath();
          ctx.arc(seg.x * CELL + e + ox, seg.y * CELL + e + oy, 1.9, 0, Math.PI * 2);
          ctx.fill();
        };
        if (d.x !== 0) {
          eye(d.x * 3.5, -3.5);
          eye(d.x * 3.5, 3.5);
        } else {
          eye(-3.5, d.y * 3.5);
          eye(3.5, d.y * 3.5);
        }
      }
    });
  }, [reducedMotion]);

  const reset = useCallback(() => {
    snakeRef.current = [{ x: 6, y: 12 }, { x: 5, y: 12 }, { x: 4, y: 12 }];
    dirRef.current = RIGHT;
    pendingDirRef.current = RIGHT;
    foodRef.current = { x: 18, y: 12 };
    bonusRef.current = null;
    particlesRef.current = [];
    applesEatenRef.current = 0;
    scoreRef.current = 0;
    gameTime.current = 0;
    previousSnake.current = [];
    interpolation.current = 1;
    setScore(0);
    setShake(false);
    setPaused(false);
    setOverlay(null);
    draw();
  }, [draw]);

  const addPoints = useCallback((pts: number) => {
    const next = scoreRef.current + pts;
    scoreRef.current = next;
    setScore(next);
    setBest((best) => Math.max(best, next));
  }, []);

  // One clock for movement and bonus lifetime; pausing freezes both.
  const rafRef = useRef(0);
  const speedRef = useRef(msPerStep);
  useEffect(() => { speedRef.current = msPerStep; }, [msPerStep]);
  useEffect(() => {
    if (overlay !== null || paused) { interpolation.current = 1; draw(); return; }
    let previous = performance.now();
    let accumulated = 0;
    const step = (t: number) => {
      const elapsed = Math.min(t - previous, 100);
      previous = t;
      gameTime.current += elapsed;
      accumulated += elapsed;
      if (accumulated >= speedRef.current) {
        accumulated %= speedRef.current;
        const dir = pendingDirRef.current;
        if (!OPPOSITE(dir, dirRef.current)) dirRef.current = dir;
        const head = snakeRef.current[0];
        let nx = head.x + dirRef.current.x;
        let ny = head.y + dirRef.current.y;
        if (wrapWalls) { nx = (nx + GRID) % GRID; ny = (ny + GRID) % GRID; }
        const next = { x: nx, y: ny };
        if (bonusRef.current && bonusRef.current.expiresAt <= gameTime.current) bonusRef.current = null;
        const food = foodRef.current;
        const bonus = bonusRef.current;
        const ateFood = next.x === food.x && next.y === food.y;
        const ateBonus = bonus !== null && next.x === bonus.x && next.y === bonus.y;
        const hitWall = !wrapWalls && (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID);
        if (hitWall || snakeCollision(snakeRef.current, next, ateFood || ateBonus)) {
          thud();
          setShake(!reducedMotion);
          setOverlay("over");
          if (scoreRef.current > 0) onGameOver?.(scoreRef.current);
          interpolation.current = 1; draw();
          return;
        }
        previousSnake.current = [...snakeRef.current];
        snakeRef.current.unshift(next);
        if (ateFood) {
          blip(720, 0.06, "square", 0.07);
          spawnBurst(food.x, food.y, "#ff3a44");
          addPoints(1);
          applesEatenRef.current++;
          let cell = randomEmptyCell(GRID, bonus ? [...snakeRef.current, bonus] : snakeRef.current);
          // If only the bonus cell remains, convert it to regular food.
          if (!cell && bonus) { bonusRef.current = null; cell = randomEmptyCell(GRID, snakeRef.current); }
          if (!cell) {
            setOverlay("won"); onGameOver?.(scoreRef.current); interpolation.current = 1; draw(); return;
          }
          foodRef.current = cell;
          if (applesEatenRef.current % 5 === 0 && !bonusRef.current) {
            const bonusCell = randomEmptyCell(GRID, [...snakeRef.current, cell]);
            if (bonusCell) bonusRef.current = { ...bonusCell, expiresAt: gameTime.current + BONUS_TTL };
          }
        } else if (ateBonus && bonus) {
          chime(); spawnBurst(bonus.x, bonus.y, "#ffe000", 18);
          bonusRef.current = null; addPoints(3);
        } else snakeRef.current.pop();
      }
      interpolation.current = Math.min(1, accumulated / speedRef.current);
      draw();
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [overlay, paused, wrapWalls, draw, addPoints, onGameOver, reducedMotion, spawnBurst]);

  // initial draw
  useEffect(() => {
    draw();
  }, [draw]);

  const turn = useCallback((d: Dir) => {
    if (overlay === "ready") {
      reset();
      if (!OPPOSITE(d, RIGHT)) pendingDirRef.current = d;
      return;
    }
    if (overlay === null && !paused && !OPPOSITE(d, dirRef.current)) pendingDirRef.current = d;
  }, [overlay, paused, reset]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const map: Record<string, Dir> = {
        arrowup: UP, w: UP, ц: UP,
        arrowdown: DOWN, s: DOWN, ы: DOWN,
        arrowleft: LEFT, a: LEFT, ф: LEFT,
        arrowright: RIGHT, d: RIGHT, в: RIGHT,
      };
      if (map[k]) {
        e.preventDefault();
        turn(map[k]);
        return;
      }
      if (k === " " && !e.repeat) {
        e.preventDefault();
        if (overlay === "ready") reset();
        else if (overlay === null) setPaused((p) => !p);
        return;
      }
      if (k === "r" || k === "к") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turn, reset, overlay]);

  // swipe
  const touchRef = useRef<{ x: number; y: number } | null>(null);
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
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP);
    touchRef.current = null;
  };

  const toggleMute = () => {
    const next = !muted;
    setSoundMuted(next);
    setMuted(next);
    if (!next) blip(880, 0.08);
  };

  return (
    <div className="game-shell">
      <div className="game-hud" aria-label="Счёт">
        <span>СЧЁТ <b key={score} className="hud-num hud-pop">{score}</b></span>
        <span>РЕКОРД <b key={best} className="hud-num">{best}</b></span>
        <span>ТЕМП <b>{speedMult}×</b></span>
        <button
          className="hud-icon"
          disabled={overlay === null}
          onClick={() => setWrapWalls((w) => !w)}
          title={wrapWalls ? "Режим: сквозь стены (тор)" : "Режим: классические стены"}
          aria-label={wrapWalls ? "Выключить проход сквозь стены" : "Включить проход сквозь стены"}
          aria-pressed={wrapWalls}
          style={wrapWalls ? { background: "var(--accent-yellow)" } : undefined}
        >
          <Repeat size={15} aria-hidden="true" />
        </button>
        {overlay === null && (
          <button
            className="hud-icon"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Продолжить" : "Пауза"}
            aria-pressed={paused}
          >
            {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
          </button>
        )}
        <button className="hud-icon" onClick={toggleMute} aria-label={muted ? "Включить звук" : "Выключить звук"} aria-pressed={!muted}>
          {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
        </button>
      </div>

      <div className={`game-stage${shake ? " shake" : ""}`}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="game-canvas"
          role="application"
          aria-label="Игровое поле змейки"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => { touchRef.current = null; }}
        />
        {overlay === "ready" && (
          <button className="game-overlay" onClick={reset} aria-label="Начать игру">
            <span className="overlay-title">ЗМЕЙКА</span>
            <span className="overlay-sub">Собирайте красные яблоки (+1) и золотые бонусы (+3).</span>
            <span className="overlay-cta"><Play size={16} aria-hidden="true" /> НАЖМИТЕ, ЧТОБЫ НАЧАТЬ</span>
          </button>
        )}
        {(overlay === "over" || overlay === "won") && (
          <div className="game-overlay" role="dialog" aria-modal="true" aria-label="Игра окончена">
            <span className="overlay-title">{overlay === "won" ? "ПОЛЕ СОБРАНО!" : "КОНЕЦ ИГРЫ"}</span>
            <span className="overlay-sub">Счёт {score} · рекорд {best}</span>
            <button className="overlay-cta overlay-btn" onClick={reset}>
              <RotateCcw size={16} aria-hidden="true" /> ЕЩЁ РАЗ · R
            </button>
          </div>
        )}
        {paused && overlay === null && (
          <button className="game-overlay game-overlay-static" onClick={() => setPaused(false)}>
            <span className="overlay-title">ПАУЗА</span>
            <span className="overlay-sub">Пробел или клик — продолжить</span>
          </button>
        )}
      </div>

      <div className="dpad" aria-label="Крестовина">
        <button className="dpad-btn dpad-up" onClick={() => turn(UP)} aria-label="Вверх"><ChevronUp size={22} aria-hidden="true" /></button>
        <button className="dpad-btn dpad-left" onClick={() => turn(LEFT)} aria-label="Влево"><ChevronLeft size={22} aria-hidden="true" /></button>
        <button className="dpad-btn dpad-center" onClick={reset} aria-label="Заново"><RotateCcw size={18} aria-hidden="true" /></button>
        <button className="dpad-btn dpad-right" onClick={() => turn(RIGHT)} aria-label="Вправо"><ChevronRight size={22} aria-hidden="true" /></button>
        <button className="dpad-btn dpad-down" onClick={() => turn(DOWN)} aria-label="Вниз"><ChevronDown size={22} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
