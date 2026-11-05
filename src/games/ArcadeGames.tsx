import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { isEditingTarget } from "./logic";
import { usePauseWhenHidden } from "./lifecycle";
import { blip } from "./sound";
import { connectFourMove, dropFour, lineWinner, mineBoard, neighbors, revealMines, shuffled, slidingBoard, ticTacToeMove, toggleLights, validMiniSudoku, type Mark } from "./arcade-logic";

type Props = { onGameOver?: (score: number) => void };
const cell: CSSProperties = { border: "1px solid #555", borderRadius: 4, background: "#282828", color: "#ece8dc", fontFamily: "var(--mono)", fontSize: "clamp(16px, 4vw, 28px)", fontWeight: 700, aspectRatio: "1", minWidth: 0, padding: 0, cursor: "pointer", touchAction: "manipulation" };
const grid = (columns: number): CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 5, padding: 12 });

function useFinish(finished: boolean, score: number, callback: Props["onGameOver"]) {
  const reported = useRef(false);
  useEffect(() => {
    if (!finished) reported.current = false;
    else if (!reported.current) { reported.current = true; callback?.(Math.max(0, Math.round(score))); }
  }, [finished, score, callback]);
}

function Frame({ children, score, status, reset, extra }: { children: ReactNode; score: number | string; status: string; reset: () => void; extra?: ReactNode }) {
  return <div className="game-shell">
    <div className="game-hud"><span>СЧЁТ <b className="hud-num">{score}</b></span>{extra}</div>
    <div className="game-stage">{children}</div>
    <p className="game-side-p" role="status" aria-live="polite" style={{ minHeight: "3em", margin: "12px 0 0" }}>{status}</p>
    <div className="game-foot"><button className="btn btn-ghost btn-sm" onClick={reset}><RotateCcw size={12} aria-hidden="true" /> Новая партия</button></div>
  </div>;
}

export function MemoryGame({ onGameOver }: Props) {
  const [cards, setCards] = useState(() => shuffled([0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7]));
  const [open, setOpen] = useState<number[]>([]), [matched, setMatched] = useState<number[]>([]), [moves, setMoves] = useState(0);
  const symbols = ["☀", "★", "◆", "♥", "☂", "♣", "♫", "☾"];
  const finished = matched.length === 16, score = Math.max(100, 2400 - moves * 50);
  useFinish(finished, score, onGameOver);
  useEffect(() => {
    if (open.length !== 2) return;
    const timer = window.setTimeout(() => {
      if (cards[open[0]] === cards[open[1]]) setMatched(previous => [...previous, ...open]);
      setOpen([]);
    }, 650);
    return () => clearTimeout(timer);
  }, [cards, open]);
  const reset = () => { setCards(shuffled(cards)); setOpen([]); setMatched([]); setMoves(0); };
  return <Frame score={finished ? score : matched.length / 2} status={finished ? `Все пары найдены за ${moves} ходов!` : `Найдите 8 пар. Ходов: ${moves}. Открыто пар: ${matched.length / 2}.`} reset={reset}>
    <div style={grid(4)} aria-label="Карточки мемори">{cards.map((value, index) => <button key={index} style={{ ...cell, color: matched.includes(index) ? "#00f076" : "#ece8dc", background: open.includes(index) || matched.includes(index) ? "#383838" : "#202020" }} disabled={finished || open.length === 2 || open.includes(index) || matched.includes(index)} aria-label={open.includes(index) || matched.includes(index) ? `Карточка ${index + 1}: ${symbols[value]}` : `Открыть карточку ${index + 1}`} onClick={() => { setOpen([...open, index]); if (open.length === 1) setMoves(moves + 1); }}>{open.includes(index) || matched.includes(index) ? symbols[value] : "?"}</button>)}</div>
  </Frame>;
}

export function MinesweeperGame({ onGameOver }: Props) {
  const [board, setBoard] = useState<number[] | null>(null), [revealed, setRevealed] = useState<number[]>([]), [flags, setFlags] = useState<number[]>([]);
  const [lost, setLost] = useState(false), [flagMode, setFlagMode] = useState(false);
  const won = !lost && revealed.length === 71, finished = won || lost;
  useFinish(finished, won ? 1000 : revealed.length * 5, onGameOver);
  const reset = () => { setBoard(null); setRevealed([]); setFlags([]); setLost(false); setFlagMode(false); };
  const flag = (index: number) => { if (finished || revealed.includes(index)) return; setFlags(flags.includes(index) ? flags.filter(n => n !== index) : flags.length < 10 ? [...flags, index] : flags); };
  const reveal = (index: number) => {
    if (finished || flags.includes(index) || revealed.includes(index)) return;
    const cells = board ?? mineBoard(index); if (!board) setBoard(cells);
    if (cells[index] === -1) { setLost(true); return; }
    setRevealed(revealMines(cells, revealed, flags, index));
  };
  return <Frame score={revealed.length * 5} status={won ? "Поле очищено! Все 10 мин найдены." : lost ? "Мина! Попробуйте новую партию." : "Откройте все клетки без мин. Первый ход безопасен. Правый клик или режим флажка — отметить мину."} reset={reset} extra={<button className="btn btn-ghost btn-sm" aria-pressed={flagMode} onClick={() => setFlagMode(!flagMode)}>⚑ {flags.length}/10 {flagMode ? "Флажки" : "Открывать"}</button>}>
    <div style={{ ...grid(9), gap: 3, padding: 8 }} aria-label="Поле сапёра 9 на 9">{Array.from({ length: 81 }, (_, index) => {
      const visible = revealed.includes(index), mine = lost && board?.[index] === -1;
      return <button key={index} style={{ ...cell, fontSize: "clamp(12px, 3vw, 20px)", background: mine ? "#bc2632" : visible ? "#3b3b3b" : "#242424", color: ["#ece8dc", "#00d2ff", "#00f076", "#ff797f"][Math.min(board?.[index] ?? 0, 3)] }} disabled={finished || visible} aria-label={`Ряд ${Math.floor(index / 9) + 1}, столбец ${index % 9 + 1}: ${mine ? "мина" : flags.includes(index) ? "флажок" : visible ? `${board?.[index] || "пусто"}` : "закрыто"}`} onContextMenu={event => { event.preventDefault(); flag(index); }} onClick={() => flagMode ? flag(index) : reveal(index)}>{mine ? "✹" : flags.includes(index) ? "⚑" : visible ? board?.[index] || "" : ""}</button>;
    })}</div>
  </Frame>;
}

function VersusGame({ onGameOver, four = false }: Props & { four?: boolean }) {
  const [board, setBoard] = useState<Mark[]>(() => Array(four ? 42 : 9).fill(null));
  const [thinking, setThinking] = useState(false);
  const winner = lineWinner(board, four ? 7 : 3, four ? 4 : 3), finished = Boolean(winner) || board.every(Boolean);
  useFinish(finished, winner === "X" ? 1000 : winner === "O" ? 0 : 300, onGameOver);
  useEffect(() => {
    if (!thinking || finished) return;
    const timer = window.setTimeout(() => {
      if (four) { const column = connectFourMove(board); if (column >= 0) setBoard(dropFour(board, column, "O")!); }
      else { const index = ticTacToeMove(board); if (index >= 0) { const next = [...board]; next[index] = "O"; setBoard(next); } }
      setThinking(false);
    }, 320);
    return () => clearTimeout(timer);
  }, [board, thinking, finished, four]);
  const play = (index: number) => {
    if (finished || thinking) return;
    if (four) { const next = dropFour(board, index % 7, "X"); if (!next) return; setBoard(next); }
    else { if (board[index]) return; const next = [...board]; next[index] = "X"; setBoard(next); }
    setThinking(true);
  };
  return <Frame score={winner === "X" ? 1000 : 0} status={winner === "X" ? "Вы выиграли!" : winner === "O" ? "Компьютер выиграл. Попробуйте ещё!" : finished ? "Ничья!" : thinking ? "Компьютер выбирает ход…" : four ? "Вы — зелёные. Выберите столбец, чтобы собрать четыре фишки в ряд." : "Вы играете крестиками. Соберите три в ряд; компьютер не уступит без борьбы."} reset={() => { setBoard(Array(four ? 42 : 9).fill(null)); setThinking(false); }}>
    <div style={grid(four ? 7 : 3)} aria-label={four ? "Четыре в ряд" : "Крестики-нолики"}>{board.map((mark, index) => <button key={index} disabled={finished || thinking || (four ? Boolean(board[index % 7]) : Boolean(mark))} style={{ ...cell, borderRadius: four ? "50%" : 4, color: mark === "X" ? "#00f076" : "#ff797f", fontSize: four ? "clamp(18px, 5vw, 38px)" : "clamp(36px, 10vw, 72px)" }} aria-label={`Ряд ${Math.floor(index / (four ? 7 : 3)) + 1}, столбец ${index % (four ? 7 : 3) + 1}: ${mark ?? "пусто"}`} onClick={() => play(index)}>{four ? mark ? "●" : "·" : mark}</button>)}</div>
  </Frame>;
}
export const TicTacToeGame = (props: Props) => <VersusGame {...props} />;
export const ConnectFourGame = (props: Props) => <VersusGame {...props} four />;

function newLights() {
  let cells = Array<boolean>(25).fill(false);
  for (const index of shuffled(Array.from({ length: 25 }, (_, i) => i)).slice(0, 12)) cells = toggleLights(cells, index);
  if (cells.every(value => !value)) cells = toggleLights(cells, 12);
  return cells;
}
export function LightsOutGame({ onGameOver }: Props) {
  const [board, setBoard] = useState(newLights), [moves, setMoves] = useState(0);
  const finished = board.every(v => !v), score = Math.max(100, 2500 - moves * 30);
  useFinish(finished, score, onGameOver);
  return <Frame score={finished ? score : moves} status={finished ? `Свет погашен за ${moves} ходов!` : "Погасите все лампы. Нажатие переключает клетку и её соседей сверху, снизу, слева и справа. Каждое поле имеет решение."} reset={() => { setBoard(newLights()); setMoves(0); }}>
    <div style={grid(5)} aria-label="Лампы 5 на 5">{board.map((on, index) => <button key={index} disabled={finished} style={{ ...cell, background: on ? "#ffe000" : "#282828", color: on ? "#141414" : "#777" }} aria-pressed={on} aria-label={`Лампа ${index + 1}: ${on ? "горит" : "погашена"}`} onClick={() => { setBoard(toggleLights(board, index)); setMoves(moves + 1); }}>{on ? "☀" : "·"}</button>)}</div>
  </Frame>;
}

export function SlidingPuzzleGame({ onGameOver }: Props) {
  const [board, setBoard] = useState(slidingBoard), [moves, setMoves] = useState(0);
  const empty = board.indexOf(0), finished = board.every((n, i) => n === (i + 1) % 16);
  useFinish(finished, Math.max(100, 4000 - moves * 10), onGameOver);
  const slide = useCallback((index: number) => {
    if (finished || !neighbors(empty, 4).includes(index)) return;
    const next = [...board]; [next[index], next[empty]] = [next[empty], next[index]]; setBoard(next); setMoves(moves + 1);
  }, [board, empty, finished, moves]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (isEditingTarget(event.target)) return;
      const delta: Record<string, number> = { ArrowUp: 4, ArrowDown: -4, ArrowLeft: 1, ArrowRight: -1 };
      if (event.key in delta) { event.preventDefault(); slide(empty + delta[event.key]); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [empty, slide]);
  return <Frame score={moves} status={finished ? `Порядок восстановлен за ${moves} ходов!` : "Расположите плитки от 1 до 15, пустая клетка — справа внизу. Нажимайте соседнюю плитку или используйте стрелки."} reset={() => { setBoard(slidingBoard()); setMoves(0); }}>
    <div style={grid(4)} aria-label="Пятнашки">{board.map((value, index) => <button key={index} disabled={!value || finished} style={{ ...cell, background: value ? value === index + 1 ? "#174632" : "#383838" : "#141414", borderColor: value ? "#777" : "transparent" }} aria-label={value ? `Плитка ${value}` : "Пустая клетка"} onClick={() => slide(index)}>{value || ""}</button>)}</div>
  </Frame>;
}

function sudokuPuzzle() {
  const digits = shuffled([1, 2, 3, 4]);
  const solution = [0, 1, 2, 3, 2, 3, 0, 1, 1, 0, 3, 2, 3, 2, 1, 0].map(i => digits[i]);
  // Keep a valid completed board and hide eight symmetric cells.
  const given = solution.map((n, i) => [0, 3, 5, 6, 9, 10, 12, 15].includes(i) ? n : 0);
  return { given, solution };
}
export function SudokuGame({ onGameOver }: Props) {
  const [puzzle, setPuzzle] = useState(sudokuPuzzle), [board, setBoard] = useState(puzzle.given), [selected, setSelected] = useState<number | null>(null), [moves, setMoves] = useState(0);
  const finished = validMiniSudoku(board);
  useFinish(finished, Math.max(100, 1500 - moves * 10), onGameOver);
  const enter = useCallback((value: number) => { if (selected === null || puzzle.given[selected] || finished) return; const next = [...board]; next[selected] = value; setBoard(next); setMoves(moves + 1); }, [selected, puzzle, finished, board, moves]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (isEditingTarget(event.target)) return; if (/^[1-4]$/.test(event.key)) { event.preventDefault(); enter(Number(event.key)); } if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); enter(0); } };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [enter]);
  return <Frame score={finished ? Math.max(100, 1500 - moves * 10) : moves} status={finished ? "Верно! В каждой строке, столбце и квадрате — числа 1–4." : "Выберите пустую клетку, затем число. В строках, столбцах и квадратах 2×2 числа 1–4 не повторяются."} reset={() => { const next = sudokuPuzzle(); setPuzzle(next); setBoard(next.given); setSelected(null); setMoves(0); }}>
    <div style={grid(4)} aria-label="Судоку 4 на 4">{board.map((value, index) => <button key={index} style={{ ...cell, outline: selected === index ? "3px solid #ffe000" : "none", color: puzzle.given[index] ? "#ece8dc" : "#00f076", borderRightWidth: index % 4 === 1 ? 4 : 1, borderBottomWidth: Math.floor(index / 4) === 1 ? 4 : 1 }} disabled={Boolean(puzzle.given[index]) || finished} aria-label={`Ряд ${Math.floor(index / 4) + 1}, столбец ${index % 4 + 1}: ${value || "пусто"}`} onClick={() => setSelected(index)}>{value || "·"}</button>)}</div>
    <div style={{ ...grid(5), paddingTop: 0 }}>{[1, 2, 3, 4, 0].map(value => <button key={value} style={{ ...cell, fontSize: 22 }} disabled={selected === null || finished} onClick={() => enter(value)} aria-label={value ? `Ввести ${value}` : "Очистить клетку"}>{value || "×"}</button>)}</div>
  </Frame>;
}

const words = ["РАКЕТА", "ПЛАНЕТА", "МУЗЫКА", "КОШКА", "СОЛНЦЕ", "КНИГА", "РЕКА", "ЗВЕЗДА", "КОРАБЛЬ", "ВЕТЕР", "РАДУГА", "БЕРЕГ"];
function wordRound(word: string) { let letters = shuffled([...word]); if (letters.join("") === word) letters = [...letters.slice(1), letters[0]]; return letters; }
export function WordScrambleGame({ onGameOver }: Props) {
  const [rounds, setRounds] = useState(() => shuffled(words).slice(0, 8)), [round, setRound] = useState(0), [letters, setLetters] = useState(() => wordRound(rounds[0])), [chosen, setChosen] = useState<number[]>([]), [mistakes, setMistakes] = useState(0), [notice, setNotice] = useState("");
  const finished = round === 8;
  useFinish(finished, Math.max(100, 2400 - mistakes * 100), onGameOver);
  const choose = (index: number) => {
    if (finished || chosen.includes(index)) return;
    const next = [...chosen, index]; setNotice("");
    if (next.length < letters.length) { setChosen(next); return; }
    if (next.map(i => letters[i]).join("") === rounds[round]) {
      setRound(round + 1); setChosen([]); setNotice("Верно!"); if (round + 1 < 8) setLetters(wordRound(rounds[round + 1]));
    } else { setChosen([]); setMistakes(mistakes + 1); setNotice("Получилось другое слово. Попробуйте ещё."); }
  };
  return <Frame score={finished ? Math.max(100, 2400 - mistakes * 100) : round * 300} status={finished ? `Все 8 слов собраны! Ошибок: ${mistakes}.` : `${notice} Слово ${round + 1} из 8. Нажимайте буквы по порядку. Ошибок: ${mistakes}.`} reset={() => { const next = shuffled(words).slice(0, 8); setRounds(next); setRound(0); setLetters(wordRound(next[0])); setChosen([]); setMistakes(0); setNotice(""); }}>
    <div style={{ padding: 24, color: "#ece8dc", textAlign: "center", minHeight: 260 }}>
      <p style={{ fontFamily: "var(--mono)", fontSize: "clamp(24px, 6vw, 38px)", letterSpacing: ".12em", minHeight: "2em" }}>{finished ? "ПОБЕДА" : letters.map((_, index) => index < chosen.length ? letters[chosen[index]] : "_").join("")}</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>{!finished && letters.map((letter, index) => <button key={index} disabled={chosen.includes(index)} style={{ ...cell, width: 42, opacity: chosen.includes(index) ? .25 : 1 }} onClick={() => choose(index)} aria-label={`Буква ${letter}, позиция ${index + 1}`}>{letter}</button>)}</div>
      <button className="overlay-btn" disabled={!chosen.length} onClick={() => setChosen(chosen.slice(0, -1))}>Отменить букву</button>
    </div>
  </Frame>;
}

export function SimonGame({ onGameOver }: Props) {
  const [sequence, setSequence] = useState<number[]>([]), [phase, setPhase] = useState<"idle" | "show" | "input" | "over">("idle"), [active, setActive] = useState(-1), [position, setPosition] = useState(0);
  const colors = ["#00b85c", "#ef3846", "#d4bc00", "#148cce"], names = ["Зелёный", "Красный", "Жёлтый", "Синий"];
  useFinish(phase === "over", Math.max(0, sequence.length - 1) * 100, onGameOver);
  useEffect(() => {
    if (phase !== "show") return;
    const timers: number[] = [];
    sequence.forEach((note, index) => {
      timers.push(window.setTimeout(() => { setActive(note); blip([330, 440, 550, 660][note], .25, "sine"); }, 500 + index * 650));
      timers.push(window.setTimeout(() => setActive(-1), 950 + index * 650));
    });
    timers.push(window.setTimeout(() => { setPhase("input"); setPosition(0); }, 500 + sequence.length * 650));
    return () => timers.forEach(clearTimeout);
  }, [phase, sequence]);
  usePauseWhenHidden(() => { if (phase === "show" || phase === "input") { setPhase("idle"); setActive(-1); } });
  const start = () => { setSequence([Math.floor(Math.random() * 4)]); setPosition(0); setActive(-1); setPhase("show"); };
  const press = (note: number) => {
    if (phase !== "input") return;
    blip([330, 440, 550, 660][note], .18, "sine");
    if (sequence[position] !== note) { setPhase("over"); return; }
    if (position + 1 === sequence.length) { setSequence([...sequence, Math.floor(Math.random() * 4)]); setPosition(0); setPhase("show"); }
    else setPosition(position + 1);
  };
  return <Frame score={Math.max(0, sequence.length - 1) * 100} status={phase === "idle" ? "Нажмите «Начать» и запомните последовательность цветов. Затем повторите её." : phase === "show" ? `Уровень ${sequence.length}. Смотрите и запоминайте…` : phase === "input" ? `Повторите цвета. Шаг ${position + 1} из ${sequence.length}.` : `Последовательность нарушена. Пройдено уровней: ${Math.max(0, sequence.length - 1)}.`} reset={start}>
    <div style={grid(2)} aria-label="Цветные клавиши">{colors.map((color, index) => <button key={color} disabled={phase !== "input"} style={{ ...cell, background: color, color: "#fff", opacity: active === index || phase === "input" ? 1 : .35, outline: active === index ? "4px solid #fff" : "none", fontSize: "clamp(16px, 3vw, 24px)" }} aria-label={names[index]} onClick={() => press(index)}>{index + 1}<span style={{ display: "block", fontSize: 12 }}>{names[index]}</span></button>)}</div>
    {phase === "idle" && <div style={{ padding: "0 12px 16px" }}><button className="overlay-btn" onClick={start}>Начать</button></div>}
  </Frame>;
}

export function WhackAMoleGame({ onGameOver }: Props) {
  const [remaining, setRemaining] = useState(30), [running, setRunning] = useState(false), [mole, setMole] = useState(-1), [score, setScore] = useState(0), [started, setStarted] = useState(false);
  const [hits, setHits] = useState(0), remainingRef = useRef(30), deadlineRef = useRef(0);
  useFinish(started && remaining === 0, score, onGameOver);
  useEffect(() => {
    if (!running) return;
    const deadline = performance.now() + remainingRef.current * 1000;
    deadlineRef.current = deadline;
    const tick = window.setInterval(() => {
      const left = Math.max(0, (deadline - performance.now()) / 1000); remainingRef.current = left; setRemaining(Math.ceil(left));
      if (!left) { setRunning(false); setMole(-1); }
    }, 80);
    const move = window.setInterval(() => setMole(previous => {
      const options = Array.from({ length: 9 }, (_, i) => i).filter(i => i !== previous); return options[Math.floor(Math.random() * options.length)];
    }), 700);
    return () => { clearInterval(tick); clearInterval(move); };
  }, [running]);
  const pause = () => {
    if (!running) return;
    const left = Math.max(0, (deadlineRef.current - performance.now()) / 1000);
    remainingRef.current = left; setRemaining(Math.ceil(left)); setRunning(false);
  };
  usePauseWhenHidden(pause);
  const reset = () => { setRunning(false); remainingRef.current = 30; setRemaining(30); setMole(-1); setScore(0); setHits(0); setStarted(false); };
  return <Frame score={score} status={!started ? "У вас 30 секунд. Попадайте по появляющемуся кроту; промах отнимает 5 очков." : !remaining ? `Время вышло! Попаданий: ${hits}.` : !running ? "Пауза. Нажмите «Продолжить»." : `Осталось ${remaining} с. Попаданий: ${hits}.`} reset={reset} extra={<span>ВРЕМЯ <b>{remaining}</b></span>}>
    <div style={grid(3)} aria-label="Норки крота">{Array.from({ length: 9 }, (_, index) => <button key={index} disabled={!running} style={{ ...cell, borderRadius: "50%", background: index === mole ? "#6a4429" : "#202020", fontSize: "clamp(26px, 8vw, 56px)" }} aria-label={`Норка ${index + 1}${index === mole ? ", крот" : ", пусто"}`} onClick={() => { if (index === mole) { setScore(score + 25); setHits(hits + 1); setMole(-1); } else setScore(Math.max(0, score - 5)); }}>{index === mole ? "🐹" : "·"}</button>)}</div>
    <div style={{ padding: "0 12px 16px" }}><button className="overlay-btn" disabled={!remaining} onClick={() => { if (running) pause(); else { setStarted(true); setRunning(true); } }}>{running ? "Пауза" : started ? "Продолжить" : "Начать"}</button></div>
  </Frame>;
}

export function ReactionGame({ onGameOver }: Props) {
  const [phase, setPhase] = useState<"idle" | "wait" | "go" | "early" | "result">("idle"), [times, setTimes] = useState<number[]>([]);
  const goTime = useRef(0), finished = times.length === 5;
  const average = times.length ? Math.round(times.reduce((sum, time) => sum + time, 0) / times.length) : 0;
  useFinish(finished, Math.max(0, 2000 - average * 2), onGameOver);
  useEffect(() => {
    if (phase !== "wait") return;
    const timer = window.setTimeout(() => { goTime.current = performance.now(); setPhase("go"); }, 1300 + Math.random() * 2700);
    return () => clearTimeout(timer);
  }, [phase]);
  usePauseWhenHidden(() => { if (phase === "go" || phase === "wait") setPhase("idle"); });
  const press = () => {
    if (finished) return;
    if (phase === "wait") { setPhase("early"); return; }
    if (phase === "go") { const elapsed = Math.round(performance.now() - goTime.current); setTimes([...times, elapsed]); setPhase("result"); return; }
    setPhase("wait");
  };
  const label = finished ? `Среднее: ${average} мс` : phase === "wait" ? "Ждите зелёного…" : phase === "go" ? "НАЖИМАЙТЕ!" : phase === "early" ? "Рано! Ещё раз" : phase === "result" ? `${times.at(-1)} мс · Далее` : "Начать раунд";
  return <Frame score={average ? `${average} мс` : "—"} status={finished ? `Все 5 раундов завершены. Средняя реакция ${average} мс. Меньше — лучше.` : `Раунд ${times.length + 1} из 5. Нажмите только после зелёного сигнала. Преждевременный клик повторяет раунд.`} reset={() => { setTimes([]); setPhase("idle"); }}>
    <button disabled={finished} onClick={press} style={{ width: "100%", minHeight: 320, padding: 24, border: 0, fontFamily: "var(--black)", fontSize: "clamp(24px, 5vw, 38px)", color: phase === "go" ? "#141414" : "#ece8dc", background: phase === "go" ? "#00f076" : phase === "wait" ? "#9a2330" : "#242424", cursor: "pointer" }} aria-live="polite">{label}</button>
  </Frame>;
}

type PongState = { x: number; y: number; vx: number; vy: number; player: number; cpu: number; points: number; opponent: number };
function newPong(): PongState { return { x: 240, y: 180, vx: 230, vy: 130, player: 180, cpu: 180, points: 0, opponent: 0 }; }
export function PongGame({ onGameOver }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null), state = useRef(newPong()), target = useRef(180), keys = useRef({ up: false, down: false });
  const animation = useRef({ frame: 0, previous: 0 });
  const [running, setRunning] = useState(false), [points, setPoints] = useState([0, 0]);
  const finished = points[0] >= 7 || points[1] >= 7;
  useFinish(finished, points[0] * 100 + (points[0] >= 7 ? 500 : 0), onGameOver);
  usePauseWhenHidden(() => { setRunning(false); keys.current = { up: false, down: false }; });
  useEffect(() => {
    const key = (event: KeyboardEvent, pressed: boolean) => {
      if (isEditingTarget(event.target)) return;
      if (["ArrowUp", "w", "W", "ArrowDown", "s", "S", " "].includes(event.key)) event.preventDefault();
      if (["ArrowUp", "w", "W"].includes(event.key)) keys.current.up = pressed;
      if (["ArrowDown", "s", "S"].includes(event.key)) keys.current.down = pressed;
      if (event.key === " " && pressed && !event.repeat && !finished) setRunning(value => !value);
    };
    const down = (event: KeyboardEvent) => key(event, true), up = (event: KeyboardEvent) => key(event, false);
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [finished]);
  useEffect(() => {
    const clock = animation.current;
    clock.previous = 0;
    const draw = (now: number) => {
      const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
      const dt = clock.previous ? Math.min((now - clock.previous) / 1000, .025) : 0; clock.previous = now;
      const s = state.current;
      if (running && !finished) {
        if (keys.current.up || keys.current.down) target.current += (Number(keys.current.down) - Number(keys.current.up)) * 420 * dt;
        target.current = Math.max(39, Math.min(321, target.current));
        s.player = target.current;
        s.cpu += Math.max(-1, Math.min(1, (s.y - s.cpu) / 20)) * 185 * dt; s.cpu = Math.max(39, Math.min(321, s.cpu));
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.y < 7 || s.y > 353) { s.y = Math.max(7, Math.min(353, s.y)); s.vy *= -1; }
        if (s.vx < 0 && s.x < 33 && s.x > 10 && Math.abs(s.y - s.player) < 45) { s.x = 33; s.vx = Math.min(440, Math.abs(s.vx) * 1.04); s.vy = (s.y - s.player) * 6; }
        if (s.vx > 0 && s.x > 447 && s.x < 470 && Math.abs(s.y - s.cpu) < 45) { s.x = 447; s.vx = -Math.min(440, Math.abs(s.vx) * 1.04); s.vy = (s.y - s.cpu) * 6; }
        if (s.x < -8 || s.x > 488) {
          if (s.x > 488) s.points++; else s.opponent++;
          setPoints([s.points, s.opponent]); s.x = 240; s.y = 180; s.vx = (s.vx > 0 ? -1 : 1) * 230; s.vy = (Math.random() - .5) * 240;
          if (s.points >= 7 || s.opponent >= 7) setRunning(false);
        }
      }
      ctx.fillStyle = "#141414"; ctx.fillRect(0, 0, 480, 360);
      ctx.strokeStyle = "#555"; ctx.setLineDash([6, 10]); ctx.beginPath(); ctx.moveTo(240, 0); ctx.lineTo(240, 360); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#00f076"; ctx.fillRect(18, s.player - 38, 10, 76);
      ctx.fillStyle = "#ff797f"; ctx.fillRect(452, s.cpu - 38, 10, 76);
      ctx.fillStyle = "#ffe000"; ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.fill();
      clock.frame = requestAnimationFrame(draw);
    };
    clock.frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(clock.frame);
  }, [running, finished]);
  const reset = () => { state.current = newPong(); target.current = 180; setPoints([0, 0]); setRunning(false); };
  return <Frame score={`${points[0]} : ${points[1]}`} status={finished ? points[0] >= 7 ? "Победа! Вы первыми набрали 7 очков." : "Компьютер набрал 7 очков. Сыграем ещё?" : running ? "Вы слева. Ведите мышью или пальцем, используйте ↑/↓ или W/S. Матч до 7 очков." : "Нажмите «Играть». Пробел — пауза; ведите платформу мышью или пальцем."} reset={reset}>
    <canvas ref={canvasRef} width={480} height={360} className="game-canvas" tabIndex={0} aria-label={`Пинг-понг: вы ${points[0]}, компьютер ${points[1]}`} onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); target.current = (event.clientY - rect.top) / rect.height * 360; }} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.getBoundingClientRect(); target.current = (event.clientY - rect.top) / rect.height * 360; }} />
    <div style={{ padding: "0 12px 16px" }}><button className="overlay-btn" disabled={finished} onClick={() => setRunning(!running)}>{running ? "Пауза" : "Играть"}</button></div>
  </Frame>;
}
