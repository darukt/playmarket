import test from 'node:test';
import assert from 'node:assert/strict';
import { connectFourMove, dropFour, lineWinner, mineBoard, neighbors, revealMines, slidingBoard, ticTacToeMove, toggleLights, validMiniSudoku } from '../src/games/arcade-logic.ts';

function seeded(seed = 42) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

test('every Minesweeper opening is safe, with exactly ten mines and correct adjacent counts', () => {
  for (let first = 0; first < 81; first++) {
    const board = mineBoard(first, seeded(first));
    assert.equal(board.filter(n => n === -1).length, 10);
    assert.equal(board[first], 0);
    for (let i = 0; i < 81; i++) if (board[i] !== -1) assert.equal(board[i], neighbors(i, 9, true).filter(n => board[n] === -1).length);
    const opened = revealMines(board, [], [], first);
    assert.ok(opened.includes(first));
    assert.ok(opened.every(i => board[i] >= 0));
    const flagged = neighbors(first, 9, true)[0];
    assert.ok(!revealMines(board, [], [flagged], first).includes(flagged));
  }
});

test('Tic-tac-toe AI cannot lose through any possible human play', () => {
  let leaves = 0;
  function play(board) {
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      const next = [...board]; next[i] = 'X';
      assert.notEqual(lineWinner(next, 3, 3), 'X');
      if (next.every(Boolean)) { leaves++; continue; }
      const move = ticTacToeMove(next);
      assert.equal(next[move], null);
      next[move] = 'O';
      if (lineWinner(next, 3, 3) || next.every(Boolean)) leaves++;
      else play(next);
    }
  }
  play(Array(9).fill(null));
  assert.ok(leaves > 100);
});

test('Connect Four detects diagonal wins without wrapping edges; AI wins or blocks immediate threats', () => {
  let board = Array(42).fill(null);
  for (let i = 0; i < 4; i++) board[(5 - i) * 7 + i] = 'X';
  assert.equal(lineWinner(board, 7, 4), 'X');
  board = Array(42).fill(null);
  for (const index of [33, 34, 35, 36]) board[index] = 'X';
  assert.equal(lineWinner(board, 7, 4), null);
  for (const mark of ['X', 'O']) {
    board = Array(42).fill(null);
    for (const column of [0, 1, 2]) board = dropFour(board, column, mark);
    assert.equal(connectFourMove(board), 3);
  }
  board = Array(42).fill(null);
  for (let i = 0; i < 6; i++) board = dropFour(board, 3, i % 2 ? 'O' : 'X');
  assert.equal(dropFour(board, 3, 'X'), null);
});

test('sliding puzzles always have all tiles and solvable parity', () => {
  for (let seed = 0; seed < 100; seed++) {
    const board = slidingBoard(seeded(seed));
    assert.equal(new Set(board).size, 16);
    assert.ok(board.every(n => n >= 0 && n < 16));
    let inversions = 0;
    const tiles = board.filter(Boolean);
    for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) if (tiles[i] > tiles[j]) inversions++;
    const blankRowFromBottom = 4 - Math.floor(board.indexOf(0) / 4);
    assert.equal((inversions + blankRowFromBottom) % 2, 1);
    assert.ok(board.some((n, i) => n !== (i + 1) % 16));
  }
});

test('Lights Out toggles only orthogonal neighbors and applying moves twice reverses them', () => {
  const dark = Array(25).fill(false);
  assert.equal(toggleLights(dark, 0).filter(Boolean).length, 3);
  assert.equal(toggleLights(dark, 12).filter(Boolean).length, 5);
  let board = dark;
  for (let i = 0; i < 25; i++) board = toggleLights(board, i);
  for (let i = 0; i < 25; i++) board = toggleLights(board, i);
  assert.deepEqual(board, dark);
});

test('mini Sudoku checks rows, columns and 2x2 boxes independently', () => {
  assert.equal(validMiniSudoku([1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1]), true);
  assert.equal(validMiniSudoku([1, 2, 3, 4, 2, 3, 4, 1, 3, 4, 1, 2, 4, 1, 2, 3]), false);
  assert.equal(validMiniSudoku(Array(16).fill(0)), false);
});
