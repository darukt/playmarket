export function shuffled<T>(items: readonly T[], random = Math.random): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function neighbors(index: number, width: number, diagonal = false): number[] {
  const x = index % width, y = Math.floor(index / width), out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
    if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < width) out.push((y + dy) * width + x + dx);
  }
  return out;
}

/** Reserve the first cell and its neighbors, so the opening always reveals space. */
export function mineBoard(first: number, random = Math.random): number[] {
  const safe = new Set([first, ...neighbors(first, 9, true)]);
  const mines = new Set(shuffled(Array.from({ length: 81 }, (_, i) => i).filter(i => !safe.has(i)), random).slice(0, 10));
  return Array.from({ length: 81 }, (_, i) => mines.has(i) ? -1 : neighbors(i, 9, true).filter(n => mines.has(n)).length);
}

export function revealMines(board: readonly number[], revealed: readonly number[], flags: readonly number[], start: number): number[] {
  const visible = new Set(revealed), blocked = new Set(flags), queue = [start];
  while (queue.length) {
    const index = queue.pop()!;
    if (visible.has(index) || blocked.has(index)) continue;
    visible.add(index);
    if (board[index] === 0) queue.push(...neighbors(index, 9, true));
  }
  return [...visible];
}

export type Mark = "X" | "O" | null;
export function lineWinner(board: readonly Mark[], width: number, goal: number): Mark {
  for (let y = 0; y < board.length / width; y++) for (let x = 0; x < width; x++) {
    const mark = board[y * width + x];
    if (!mark) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      let count = 1;
      while (count < goal && x + dx * count >= 0 && x + dx * count < width && y + dy * count < board.length / width && board[(y + dy * count) * width + x + dx * count] === mark) count++;
      if (count === goal) return mark;
    }
  }
  return null;
}

export function ticTacToeMove(board: readonly Mark[]): number {
  function minimax(cells: Mark[], turn: "X" | "O"): number {
    const win = lineWinner(cells, 3, 3);
    if (win) return win === "O" ? 10 : -10;
    if (cells.every(Boolean)) return 0;
    const values = cells.flatMap((cell, index) => {
      if (cell) return [];
      const next = [...cells]; next[index] = turn;
      return [minimax(next, turn === "O" ? "X" : "O")];
    });
    return turn === "O" ? Math.max(...values) : Math.min(...values);
  }
  let best = -Infinity, selected = -1;
  for (const index of [4, 0, 2, 6, 8, 1, 3, 5, 7]) {
    if (board[index]) continue;
    const next = [...board]; next[index] = "O";
    const score = minimax(next, "X");
    if (score > best) { best = score; selected = index; }
  }
  return selected;
}

export function dropFour(board: readonly Mark[], column: number, mark: "X" | "O"): Mark[] | null {
  if (!Number.isInteger(column) || column < 0 || column > 6) return null;
  for (let row = 5; row >= 0; row--) {
    const index = row * 7 + column;
    if (!board[index]) { const next = [...board]; next[index] = mark; return next; }
  }
  return null;
}

export function connectFourMove(board: readonly Mark[]): number {
  const columns = [3, 2, 4, 1, 5, 0, 6].filter(c => !board[c]);
  for (const mark of ["O", "X"] as const) for (const c of columns) if (lineWinner(dropFour(board, c, mark)!, 7, 4) === mark) return c;
  function evaluate(cells: Mark[], depth: number, turn: "X" | "O"): number {
    const win = lineWinner(cells, 7, 4);
    if (win) return (win === "O" ? 1000 : -1000) * (depth + 1);
    if (!depth) return cells.reduce<number>((sum, m, i) => sum + (i % 7 === 3 ? m === "O" ? 3 : m === "X" ? -3 : 0 : 0), 0);
    const values = columns.flatMap(c => { const next = dropFour(cells, c, turn); return next ? [evaluate(next, depth - 1, turn === "O" ? "X" : "O")] : []; });
    return values.length ? turn === "O" ? Math.max(...values) : Math.min(...values) : 0;
  }
  let best = -Infinity, selected = columns[0] ?? -1;
  for (const c of columns) { const score = evaluate(dropFour(board, c, "O")!, 3, "X"); if (score > best) { best = score; selected = c; } }
  return selected;
}

export function toggleLights(board: readonly boolean[], index: number): boolean[] {
  const next = [...board];
  for (const n of [index, ...neighbors(index, 5)]) next[n] = !next[n];
  return next;
}

export function slidingBoard(random = Math.random): number[] {
  const board = Array.from({ length: 16 }, (_, i) => (i + 1) % 16);
  let empty = 15, previous = -1;
  for (let step = 0; step < 180; step++) {
    const options = neighbors(empty, 4).filter(i => i !== previous);
    const selected = options[Math.floor(random() * options.length)];
    [board[empty], board[selected]] = [board[selected], board[empty]];
    previous = empty; empty = selected;
  }
  if (board.every((value, i) => value === (i + 1) % 16)) [board[14], board[15]] = [board[15], board[14]];
  return board;
}

export function validMiniSudoku(board: readonly number[]): boolean {
  if (board.length !== 16 || board.some(v => v < 1 || v > 4)) return false;
  for (let i = 0; i < 4; i++) {
    if (new Set(board.slice(i * 4, i * 4 + 4)).size !== 4) return false;
    if (new Set([0, 1, 2, 3].map(r => board[r * 4 + i])).size !== 4) return false;
    const row = Math.floor(i / 2) * 2, col = i % 2 * 2;
    if (new Set([board[row * 4 + col], board[row * 4 + col + 1], board[(row + 1) * 4 + col], board[(row + 1) * 4 + col + 1]]).size !== 4) return false;
  }
  return true;
}
