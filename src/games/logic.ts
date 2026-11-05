export type Direction = "left" | "right" | "up" | "down";
export type Board = (number | null)[];
export type Cell = { x: number; y: number };

/** Bound catch-up work after a slow frame without tying simulation speed to refresh rate. */
export function fixedStepBudget(accumulated: number, elapsed: number, interval = 1000 / 60, maxSteps = 5) {
  const total = accumulated + Math.max(0, elapsed);
  const wholeSteps = Math.floor((total + 1e-9) / interval);
  return { steps: Math.min(maxSteps, wholeSteps), remainder: Math.max(0, total - wholeSteps * interval) };
}

export function slideRow(row: Board): { row: Board; gained: number } {
  const compact = row.filter((v): v is number => v !== null);
  const merged: Board = [];
  let gained = 0;
  for (let i = 0; i < compact.length; i++) {
    if (compact[i] === compact[i + 1]) {
      merged.push(compact[i] * 2);
      gained += compact[i] * 2;
      i++;
    } else merged.push(compact[i]);
  }
  while (merged.length < row.length) merged.push(null);
  return { row: merged, gained };
}

export function move(board: Board, dir: Direction) {
  const next = [...board];
  const size = Math.sqrt(board.length);
  let gained = 0;
  for (let n = 0; n < size; n++) {
    const cells = Array.from({ length: size }, (_, i) => {
      if (dir === "left") return n * size + i;
      if (dir === "right") return n * size + size - 1 - i;
      if (dir === "up") return i * size + n;
      return (size - 1 - i) * size + n;
    });
    const result = slideRow(cells.map((i) => board[i]));
    gained += result.gained;
    cells.forEach((cell, i) => { next[cell] = result.row[i]; });
  }
  return { next, gained, changed: next.some((v, i) => v !== board[i]) };
}

export function canMove(board: Board): boolean {
  if (board.includes(null)) return true;
  return (["left", "up"] as const).some((dir) => move(board, dir).changed);
}

/** Select among available cells once: a full board must finish, never spin forever. */
export function randomEmptyCell(grid: number, excluded: Cell[], random = Math.random): Cell | null {
  const occupied = new Set(excluded.map((cell) => cell.y * grid + cell.x));
  const free: number[] = [];
  for (let i = 0; i < grid * grid; i++) if (!occupied.has(i)) free.push(i);
  if (!free.length) return null;
  const index = free[Math.min(free.length - 1, Math.floor(random() * free.length))];
  return { x: index % grid, y: Math.floor(index / grid) };
}

export function snakeCollision(snake: Cell[], next: Cell, grows: boolean): boolean {
  // The tail leaves its cell in this same step unless an apple grows the snake.
  return snake.slice(0, grows ? snake.length : -1).some((cell) => cell.x === next.x && cell.y === next.y);
}

export function isEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox'], dialog[open]"));
}

export function readBest(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}

export function persistBest(key: string, value: number) {
  try { localStorage.setItem(key, String(value)); } catch { /* Private mode/storage quota. */ }
}
