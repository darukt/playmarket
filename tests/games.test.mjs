import test from 'node:test';
import assert from 'node:assert/strict';
import { slideRow, move, canMove, randomEmptyCell, snakeCollision } from '../src/games/logic.ts';

test('2048 merges each original tile once and accounts for score', () => {
  assert.deepEqual(slideRow([2, 2, 2, 2]), { row: [4, 4, null, null], gained: 8 });
  assert.deepEqual(slideRow([2, 2, 4, null]), { row: [4, 4, null, null], gained: 4 });
});

test('2048 moves all four directions without mutating the original board', () => {
  const board = [2, null, null, 2, ...Array(12).fill(null)];
  const left = move(board, 'left');
  assert.deepEqual(left.next.slice(0, 4), [4, null, null, null]);
  assert.deepEqual(move(board, 'right').next.slice(0, 4), [null, null, null, 4]);
  const column = [2, null, null, null, 2, ...Array(11).fill(null)];
  assert.equal(move(column, 'up').next[0], 4);
  assert.equal(move(column, 'down').next[12], 4);
  assert.equal(board[0], 2);
  assert.equal(board[3], 2);
});

test('2048 detects dead boards and preserves a no-op', () => {
  const board = [2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2];
  assert.equal(canMove(board), false);
  assert.equal(move(board, 'right').changed, false);
  board[0] = 4;
  assert.equal(canMove(board), true);
});

test('Snake may enter the cell vacated by its tail, but not while growing', () => {
  const snake = [{x:1,y:1},{x:1,y:2},{x:2,y:2},{x:2,y:1}];
  assert.equal(snakeCollision(snake, {x:2,y:1}, false), false);
  assert.equal(snakeCollision(snake, {x:2,y:1}, true), true);
  assert.equal(snakeCollision(snake, {x:1,y:2}, false), true);
});

test('Snake full-grid spawn terminates; last available cell remains selectable', () => {
  const occupied = Array.from({length:9}, (_, i) => ({x:i%3,y:Math.floor(i/3)}));
  assert.equal(randomEmptyCell(3, occupied), null);
  assert.deepEqual(randomEmptyCell(3, occupied.slice(0,-1), () => 0.9), {x:2,y:2});
});

import { mergeLocalScore, validScoreRows } from '../src/games/scores.ts';
import { fixedStepBudget } from '../src/games/logic.ts';

test('Breakout simulation advances equally on 60 and 144 Hz monitors', () => {
  function simulate(hz) {
    let steps = 0, accumulated = 0;
    for (let i = 0; i < hz; i++) {
      const budget = fixedStepBudget(accumulated, 1000 / hz);
      accumulated = budget.remainder; steps += budget.steps;
    }
    return steps;
  }
  assert.equal(simulate(60), 60);
  assert.equal(simulate(144), 60);
  assert.equal(fixedStepBudget(0, 20_000).steps, 5);
});
test('Local scores keep one personal best and never downgrade it', () => {
  const rows = [{rank:1,name:'old',score:20,ts:1,mine:true},{rank:2,name:'duplicate',score:5,ts:1,mine:true}];
  const improved = mergeLocalScore(rows, 'new', 30, 2);
  assert.equal(improved.length, 1); assert.equal(improved[0].score, 30);
  assert.equal(mergeLocalScore(improved, 'low', 10, 3)[0].score, 30);
});
test('Corrupt persisted scores cannot break leaderboard rendering', () => {
  assert.deepEqual(validScoreRows([null, {}, {rank:1,name:7,score:NaN,ts:1}]), []);
  assert.deepEqual(validScoreRows('invalid'), []);
});
