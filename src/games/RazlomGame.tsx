import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { blip, thud, chime, soundMuted, setSoundMuted } from "./sound";
import { readBest, persistBest, isEditingTarget, fixedStepBudget } from "./logic";
import { useReducedMotion, usePauseWhenHidden } from "./lifecycle";

const W = 560;
const H = 420;
const BASE_PADDLE_W = 96;
const WIDE_PADDLE_W = 144;
const PADDLE_H = 12;
const BALL_R = 6;
const LIVES_MAX = 3;
const BEST_KEY = "pm-razlom-best";

const BRICK_ROWS = 5;
const BRICK_COLS = 10;
const BRICK_W = 46;
const BRICK_H = 16;
const BRICK_GAP = 4;
const BRICKS_TOP = 48;

const ROW_COLORS = ["#ffe000", "#ff7a1f", "#ff3a44", "#ece8dc", "#00d2ff"];
const ROW_POINTS = [50, 40, 30, 20, 10];

type Overlay = "ready" | "over" | "cleared" | null;
type Ball = { x: number; y: number; vx: number; vy: number; stuck: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };
type CapsuleKind = "wide" | "multi" | "life";
type Capsule = { x: number; y: number; kind: CapsuleKind };

function makeLevelBricks(level: number): number[] {
  const hp = Array<number>(BRICK_ROWS * BRICK_COLS).fill(1);
  if (level <= 1) return hp;
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      const i = r * BRICK_COLS + c;
      if (level % 3 === 2 && (r + c) % 2 === 0 && r < 2) {
        hp[i] = 2; // укреплённый ряд в шахматном порядке
      } else if (level % 3 === 0 && (r === 0 || (r === 1 && c >= 2 && c <= 7))) {
        hp[i] = 2;
      } else if (r === 0 && level >= 2) {
        hp[i] = 2;
      }
    }
  }
  return hp;
}

export default function RazlomGame({ onGameOver }: { onGameOver?: (score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paddleRef = useRef({ x: W / 2 - BASE_PADDLE_W / 2, wideUntil: 0 });
  const ballsRef = useRef<Ball[]>([{ x: W / 2, y: H - 26, vx: 2.4, vy: -3.2, stuck: true }]);
  const bricksRef = useRef<number[]>(makeLevelBricks(1));
  const capsulesRef = useRef<Capsule[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const comboRef = useRef(0);
  const shakeRef = useRef(0);
  const rafRef = useRef(0);
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const livesRef = useRef(LIVES_MAX);
  const gameTime = useRef(0);
  const activeRef = useRef(false);
  const keysRef = useRef({ left: false, right: false });
  const reducedMotion = useReducedMotion();

  const [overlay, setOverlay] = useState<Overlay>("ready");
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(soundMuted());
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(LIVES_MAX);
  const [best, setBest] = useState(() => readBest(BEST_KEY));
  useEffect(() => { persistBest(BEST_KEY, best); }, [best]);
  usePauseWhenHidden(() => {
    keysRef.current = { left: false, right: false };
    if (overlay === null) setPaused(true);
  });

  const currentPaddleW = () => (gameTime.current < paddleRef.current.wideUntil ? WIDE_PADDLE_W : BASE_PADDLE_W);

  const addScore = useCallback((pts: number) => {
    const next = scoreRef.current + pts;
    scoreRef.current = next;
    setScore(next);
    setBest((best) => Math.max(best, next));
  }, []);

  const spawnParticles = useCallback((x: number, y: number, color: string, count: number, spread = 2.4) => {
    if (reducedMotion) return;
    for (let i = 0; i < count && particlesRef.current.length < 400; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * spread * 2.4,
        vy: (Math.random() - 1.2) * spread,
        life: 34 + Math.floor(Math.random() * 16),
        max: 50,
        size: 2 + Math.random() * 2.6,
        color,
      });
    }
  }, [reducedMotion]);

  const brickRect = (i: number) => {
    const row = Math.floor(i / BRICK_COLS);
    const col = i % BRICK_COLS;
    const totalW = BRICK_COLS * BRICK_W + (BRICK_COLS - 1) * BRICK_GAP;
    const startX = (W - totalW) / 2;
    return { x: startX + col * (BRICK_W + BRICK_GAP), y: BRICKS_TOP + row * (BRICK_H + BRICK_GAP) };
  };

  const resetBall = useCallback((stuck = true) => {
    const pw = currentPaddleW();
    const baseSpeed = Math.min(4.2, 3.2 + (levelRef.current - 1) * 0.2);
    ballsRef.current = [
      {
        x: paddleRef.current.x + pw / 2,
        y: H - 26,
        vx: (Math.random() < 0.5 ? -1 : 1) * 2.3,
        vy: -baseSpeed,
        stuck,
      },
    ];
    comboRef.current = 0;
  }, []);

  const reset = useCallback(() => {
    paddleRef.current = { x: W / 2 - BASE_PADDLE_W / 2, wideUntil: 0 };
    levelRef.current = 1;
    scoreRef.current = 0;
    livesRef.current = LIVES_MAX;
    gameTime.current = 0;
    activeRef.current = true;
    keysRef.current = { left: false, right: false };
    bricksRef.current = makeLevelBricks(1);
    capsulesRef.current = [];
    particlesRef.current = [];
    setLevel(1);
    setScore(0);
    setLives(LIVES_MAX);
    setPaused(false);
    setOverlay(null);
    resetBall(true);
  }, [resetBall]);

  const nextLevel = useCallback(() => {
    activeRef.current = true;
    setPaused(false);
    const nl = levelRef.current + 1;
    levelRef.current = nl;
    setLevel(nl);
    bricksRef.current = makeLevelBricks(nl);
    capsulesRef.current = [];
    setOverlay(null);
    resetBall(false);
  }, [resetBall]);

  const draw = useCallback((advance = 0) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    if (!reducedMotion && shakeRef.current > 0) {
      ctx.translate((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
      shakeRef.current = Math.max(0, shakeRef.current - advance);
    }
    ctx.fillStyle = "#141414";
    ctx.fillRect(-8, -8, W + 16, H + 16);

    // bricks
    bricksRef.current.forEach((hp, i) => {
      if (hp <= 0) return;
      const row = Math.floor(i / BRICK_COLS);
      const { x, y } = brickRect(i);
      ctx.fillStyle = ROW_COLORS[row];
      ctx.fillRect(x, y, BRICK_W, BRICK_H);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x, y, BRICK_W, 4);
      ctx.strokeStyle = hp >= 2 ? "#ffffff" : "#141414";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, BRICK_W - 2, BRICK_H - 2);
    });

    // falling power-up capsules
    capsulesRef.current.forEach((c) => {
      const color = c.kind === "wide" ? "#ffe000" : c.kind === "multi" ? "#00d2ff" : "#00f076";
      const label = c.kind === "wide" ? "W" : c.kind === "multi" ? "M" : "+";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(c.x - 11, c.y - 7, 22, 14, 4);
      ctx.fill();
      ctx.fillStyle = "#141414";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, c.x, c.y + 0.5);
    });

    // particles
    const parts = particlesRef.current;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * advance;
      p.y += p.vy * advance;
      p.vy += 0.09 * advance;
      p.life -= advance;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // paddle
    const p = paddleRef.current;
    const pw = currentPaddleW();
    ctx.fillStyle = pw > BASE_PADDLE_W ? "#ffe000" : "#00f076";
    ctx.fillRect(p.x, H - 16, pw, PADDLE_H);
    ctx.fillStyle = pw > BASE_PADDLE_W ? "#b89b00" : "#0d6b32";
    ctx.fillRect(p.x, H - 16 + PADDLE_H - 4, pw, 4);

    // balls
    ctx.shadowColor = "#ece8dc";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ece8dc";
    for (const b of ballsRef.current) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // combo indicator
    if (comboRef.current >= 2) {
      ctx.fillStyle = "#ffe000";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`КОМБО ×${Math.min(4, comboRef.current)}`, W - 12, 22);
    }
    ctx.restore();
  }, [reducedMotion]);

  const applyCapsule = useCallback((kind: CapsuleKind) => {
    chime();
    if (kind === "wide") {
      paddleRef.current.wideUntil = gameTime.current + 12_000;
      paddleRef.current.x = Math.min(paddleRef.current.x, W - WIDE_PADDLE_W);
    } else if (kind === "life") {
      livesRef.current = Math.min(5, livesRef.current + 1);
      setLives(livesRef.current);
    } else if (kind === "multi") {
      const active = ballsRef.current[0];
      if (active && ballsRef.current.length <= 7) {
        active.stuck = false;
        ballsRef.current.push(
          { x: active.x, y: active.y, vx: -Math.abs(active.vx) - 0.6, vy: -Math.abs(active.vy), stuck: false },
          { x: active.x, y: active.y, vx: Math.abs(active.vx) + 0.6, vy: -Math.abs(active.vy), stuck: false }
        );
      }
    }
  }, []);

  const step = useCallback(() => {
    if (!activeRef.current) return;
    gameTime.current += 1000 / 60;
    const paddle = paddleRef.current;
    const pw = currentPaddleW();
    const bricks = bricksRef.current;
    if (keysRef.current.left) paddle.x = Math.max(0, paddle.x - 9);
    if (keysRef.current.right) paddle.x = Math.min(W - pw, paddle.x + 9);

    // capsules
    const caps = capsulesRef.current;
    for (let i = caps.length - 1; i >= 0; i--) {
      const c = caps[i];
      c.y += 2.2;
      if (c.y >= H - 20 && c.y <= H - 4 && c.x >= paddle.x - 10 && c.x <= paddle.x + pw + 10) {
        caps.splice(i, 1);
        applyCapsule(c.kind);
        addScore(25);
        continue;
      }
      if (c.y > H + 12) caps.splice(i, 1);
    }

    const balls = ballsRef.current;
    for (let bi = balls.length - 1; bi >= 0; bi--) {
      const ball = balls[bi];
      if (ball.stuck) {
        ball.x = paddle.x + pw / 2;
        ball.y = H - 26;
        continue;
      }
      ball.x += ball.vx;
      ball.y += ball.vy;

      // walls
      if (ball.x - BALL_R < 0) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); blip(500, 0.04, "triangle", 0.05); }
      if (ball.x + BALL_R > W) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); blip(500, 0.04, "triangle", 0.05); }
      if (ball.y - BALL_R < 0) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); blip(500, 0.04, "triangle", 0.05); }

      // paddle
      if (
        ball.vy > 0 &&
        ball.y + BALL_R >= H - 16 &&
        ball.y - BALL_R <= H - 16 + PADDLE_H &&
        ball.x >= paddle.x - BALL_R &&
        ball.x <= paddle.x + pw + BALL_R
      ) {
        const hit = (ball.x - (paddle.x + pw / 2)) / (pw / 2);
        const speed = Math.min(6.4, Math.hypot(ball.vx, ball.vy) + 0.14);
        const angle = -Math.PI / 2 + hit * (Math.PI / 3.1);
        ball.vx = Math.cos(angle) * speed;
        ball.vy = Math.sin(angle) * speed;
        ball.y = H - 16 - BALL_R;
        comboRef.current = 0;
        blip(760, 0.05, "square", 0.06);
      }

      // bottom
      if (ball.y - BALL_R > H) {
        balls.splice(bi, 1);
        if (balls.length === 0) {
          thud();
          shakeRef.current = 14;
          spawnParticles(ball.x, H - 6, "#ff3a44", 12, 3);
          livesRef.current = Math.max(0, livesRef.current - 1);
          setLives(livesRef.current);
          if (livesRef.current === 0) {
            activeRef.current = false;
            setOverlay("over");
            if (scoreRef.current > 0) onGameOver?.(scoreRef.current);
          } else resetBall(true);
          return;
        }
        continue;
      }

      // bricks
      for (let i = 0; i < bricks.length; i++) {
        if (bricks[i] <= 0) continue;
        const row = Math.floor(i / BRICK_COLS);
        const { x, y } = brickRect(i);
        if (ball.x + BALL_R < x || ball.x - BALL_R > x + BRICK_W || ball.y + BALL_R < y || ball.y - BALL_R > y + BRICK_H) continue;
        bricks[i] -= 1;
        comboRef.current += 1;
        const mult = Math.min(4, comboRef.current);
        if (bricks[i] <= 0) {
          addScore(ROW_POINTS[row] * mult);
          spawnParticles(x + BRICK_W / 2, y + BRICK_H / 2, ROW_COLORS[row], 14, 2.6);
          if (Math.random() < 0.16 && capsulesRef.current.length < 3) {
            const kinds: CapsuleKind[] = ["wide", "multi", "life"];
            capsulesRef.current.push({
              x: x + BRICK_W / 2,
              y: y + BRICK_H / 2,
              kind: kinds[Math.floor(Math.random() * kinds.length)],
            });
          }
        } else {
          addScore(10);
          spawnParticles(x + BRICK_W / 2, y + BRICK_H / 2, "#ffffff", 6, 1.8);
        }
        blip(980 - row * 120, 0.05, "square", 0.05);
        const overlapX = Math.min(ball.x + BALL_R - x, x + BRICK_W - (ball.x - BALL_R));
        const overlapY = Math.min(ball.y + BALL_R - y, y + BRICK_H - (ball.y - BALL_R));
        if (overlapX < overlapY) {
          const left = ball.x < x + BRICK_W / 2;
          ball.x = left ? x - BALL_R - 0.01 : x + BRICK_W + BALL_R + 0.01;
          ball.vx = left ? -Math.abs(ball.vx) : Math.abs(ball.vx);
        } else {
          const above = ball.y < y + BRICK_H / 2;
          ball.y = above ? y - BALL_R - 0.01 : y + BRICK_H + BALL_R + 0.01;
          ball.vy = above ? -Math.abs(ball.vy) : Math.abs(ball.vy);
        }
        break;
      }
    }

    // level clear check
    if (bricks.every((b) => b <= 0)) {
      activeRef.current = false;
      chime();
      addScore(150 * levelRef.current);
      setOverlay("cleared");
    }
  }, [addScore, applyCapsule, onGameOver, resetBall, spawnParticles]);

  // Fixed simulation steps keep ball speed identical on 60/120/144 Hz screens.
  useEffect(() => {
    draw();
    if (overlay !== null || paused) return;
    let last = performance.now();
    let accumulated = 0;
    const frame = 1000 / 60;
    const loop = (t: number) => {
      const elapsed = Math.min(100, t - last);
      last = t;
      const budget = fixedStepBudget(accumulated, elapsed);
      accumulated = budget.remainder;
      for (let i = 0; i < budget.steps && activeRef.current; i++) step();
      draw(elapsed / frame);
      if (activeRef.current) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [overlay, paused, step, draw]);

  const movePaddleTo = useCallback((clientX: number, rect: DOMRect) => {
    const scale = W / rect.width;
    const pw = currentPaddleW();
    paddleRef.current.x = Math.min(Math.max((clientX - rect.left) * scale - pw / 2, 0), W - pw);
  }, []);

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (paused || overlay !== null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width > 0) movePaddleTo(e.clientX, rect);
  };

  const launch = useCallback(() => {
    if (overlay === "ready") {
      reset();
      ballsRef.current = ballsRef.current.map((ball) => ({ ...ball, stuck: false }));
      return;
    }
    if (overlay === "cleared") {
      nextLevel();
      return;
    }
    if (overlay !== null || paused) return;
    const unstuck = ballsRef.current.some((ball) => ball.stuck);
    if (unstuck) ballsRef.current = ballsRef.current.map((ball) => ({ ...ball, stuck: false }));
    if (unstuck && overlay === null) {
      blip(880, 0.08, "square", 0.06);
    }
  }, [overlay, paused, reset, nextLevel]);

  // keyboard
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a" || k === "ф") { keysRef.current.left = true; e.preventDefault(); }
      else if (k === "arrowright" || k === "d" || k === "в") { keysRef.current.right = true; e.preventDefault(); }
      else if (k === " " && !e.repeat) { e.preventDefault(); launch(); }
      else if ((k === "p" || k === "з") && !e.repeat) { if (overlay === null) setPaused((p) => !p); }
      else if (k === "r" || k === "к") reset();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a" || k === "ф") keysRef.current.left = false;
      else if (k === "arrowright" || k === "d" || k === "в") keysRef.current.right = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      keysRef.current.left = false; keysRef.current.right = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [launch, reset, overlay]);

  const toggleMute = () => {
    const next = !muted;
    setSoundMuted(next);
    setMuted(next);
    if (!next) blip(880, 0.08);
  };

  return (
    <div className="game-shell">
      <div className="game-hud" aria-label="Счёт">
        <span>СЧЁТ <b>{score}</b></span>
        <span>РЕКОРД <b>{best}</b></span>
        <span>УР. <b>{level}</b></span>
        <span>ЖИЗНИ <b>{"▮".repeat(lives) || "—"}</b></span>
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

      <div className="game-stage game-stage-wide">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="game-canvas game-canvas-wide"
          role="application"
          aria-label="Игровое поле Разлома"
          onPointerMove={onPointerMove}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            onPointerMove(event);
            launch();
          }}
        />
        {overlay === "ready" && (
          <button className="game-overlay" onClick={launch} aria-label="Запустить мяч">
            <span className="overlay-title">РАЗЛОМ</span>
            <span className="overlay-sub">Ловите капсулы: W — широкая платформа, M — мульти-мяч, + — жизнь.</span>
            <span className="overlay-cta"><Play size={16} aria-hidden="true" /> НАЖМИТЕ, ЧТОБЫ НАЧАТЬ</span>
          </button>
        )}
        {overlay === "cleared" && (
          <div className="game-overlay" role="dialog" aria-modal="true" aria-label="Уровень пройден">
            <span className="overlay-title">УРОВЕНЬ {level} ПРОЙДЕН</span>
            <span className="overlay-sub">Счёт {score} · бонус +{150 * level}</span>
            <button className="overlay-cta overlay-btn" onClick={nextLevel}>
              <Play size={16} aria-hidden="true" /> УРОВЕНЬ {level + 1} · ПРОБЕЛ
            </button>
          </div>
        )}
        {overlay === "over" && (
          <div className="game-overlay" role="alertdialog" aria-label="Игра окончена">
            <span className="overlay-title">МЯЧ УТРАЧЕН</span>
            <span className="overlay-sub">Счёт {score} · уровень {level} · рекорд {best}</span>
            <button className="overlay-cta overlay-btn" onClick={reset}>
              <RotateCcw size={16} aria-hidden="true" /> ЕЩЁ РАЗ · R
            </button>
          </div>
        )}
        {paused && overlay === null && (
          <button className="game-overlay game-overlay-static" onClick={() => setPaused(false)}>
            <span className="overlay-title">ПАУЗА</span>
            <span className="overlay-sub">Клик или P — продолжить</span>
          </button>
        )}
      </div>

      <div className="game-foot">
        <button className="btn btn-ghost btn-sm" onClick={reset}>
          <RotateCcw size={12} aria-hidden="true" /> Заново · R
        </button>
      </div>
    </div>
  );
}
