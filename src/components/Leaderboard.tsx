import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trophy, Send } from "lucide-react";
import { api, ApiError } from "../services/api";
import { useSession } from "../hooks/useSession";
import { mergeLocalScore, validScoreRows, type ScoreRow } from "../games/scores";

interface ScoresPayload { game: string; top: ScoreRow[]; me?: ScoreRow | null; rank?: number; }
const NAME_KEY = "pm.playerName";
const boardKey = (slug: string) => `pm.scores.${slug}`;
function loadLocalBoard(slug: string): ScoreRow[] {
  try { return validScoreRows(JSON.parse(localStorage.getItem(boardKey(slug)) ?? "[]")); }
  catch { return []; }
}

export default function Leaderboard({ slug, lastScore }: { slug: string; lastScore: number | null }) {
  const { data: session, readSession } = useSession();
  const client = useQueryClient();
  const [localRows, setLocalRows] = useState(() => loadLocalBoard(slug));
  const [mode, setMode] = useState<"server" | "local">("server");
  const [name, setName] = useState(() => {
    try { return localStorage.getItem(NAME_KEY) || "Игрок"; } catch { return "Игрок"; }
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [submittedScore, setSubmittedScore] = useState<number | null>(null);
  const pending = useRef<AbortController | null>(null);
  const queryKey = ["scores", slug, session?.user?.id ?? "guest"];
  const board = useQuery({
    queryKey,
    queryFn: ({ signal }) => api<ScoresPayload>(`/api/games/${encodeURIComponent(slug)}/scores?limit=10`, { signal }),
    staleTime: 15_000,
  });
  useEffect(() => () => pending.current?.abort(), []);
  const showLocal = mode === "local" || board.isError;
  const rows = showLocal ? localRows : validScoreRows(board.data?.top);
  const me = !showLocal ? board.data?.me : null;
  const canSubmit = lastScore !== null && lastScore > 0;
  const savedLocally = canSubmit && localRows.some((row) => row.mine && row.score >= lastScore);

  function saveOnDevice() {
    if (!lastScore) return;
    const clean = name.trim() || "Игрок";
    const local = mergeLocalScore(loadLocalBoard(slug), clean, lastScore, Math.floor(Date.now() / 1000));
    try {
      localStorage.setItem(boardKey(slug), JSON.stringify(local));
      localStorage.setItem(NAME_KEY, clean);
      setStatus("Результат сохранён на этом устройстве. В общую таблицу он не отправлен.");
    } catch { setStatus("Хранилище браузера недоступно. Результат останется до закрытия страницы."); }
    setLocalRows(local);
    setMode("local");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || lastScore === submittedScore || pending.current || !session?.user) return;
    const controller = new AbortController();
    pending.current = controller;
    const score = lastScore;
    setBusy(true); setStatus(null);
    try {
      const current = await readSession();
      if (!current.user) throw new ApiError(401, "Sign-in required");
      const data = await api<ScoresPayload>(`/api/games/${encodeURIComponent(slug)}/scores`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-CSRF-Token": current.csrfToken },
        body: JSON.stringify({ name: name.trim() || "Игрок", score }),
      });
      client.setQueryData(["scores", slug, current.user.id], data);
      setMode("server"); setSubmittedScore(score);
      setStatus(data.rank ? `Результат записан. Место в таблице: ${data.rank}.` : "Результат записан.");
      try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* Optional preference. */ }
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus(error instanceof ApiError && error.status === 401 ? "Войдите в аккаунт, чтобы отправить результат." : "Не удалось отправить результат. Повторите попытку или сохраните его на устройстве.");
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <div className="leaderboard">
    <h2 className="game-side-h" style={{ marginTop: 22 }}><Trophy size={16} aria-hidden="true" />Таблица рекордов</h2>
    <div className="lb-actions">
      <button className="text-button" onClick={() => setMode("server")} aria-pressed={!showLocal}>Общая</button>
      <button className="text-button" onClick={() => setMode("local")} aria-pressed={showLocal}>На устройстве</button>
    </div>
    <p className="lb-mode">{showLocal ? "Личные результаты в этом браузере" : "Результаты игроков · любительская таблица"}</p>
    {canSubmit && <form className="lb-form" onSubmit={(event) => void submit(event)}>
      <input className="lb-input" type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="Ваше имя" aria-label="Имя для таблицы рекордов" />
      <div className="lb-actions">
        {session?.user && <button type="submit" className="btn btn-sm" disabled={busy || lastScore === submittedScore}><Send size={12} aria-hidden="true" />{busy ? "Отправляем…" : lastScore === submittedScore ? "Отправлено" : `Отправить ${lastScore}`}</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={saveOnDevice} disabled={busy || savedLocally}>{savedLocally ? "Сохранено на устройстве" : "Сохранить на устройстве"}</button>
      </div>
      {!session?.user && <p className="game-side-p">Войдите через кнопку «Войти», чтобы попасть в общую таблицу.</p>}
    </form>}
    {status && <p className="lb-status" role="status">{status}</p>}
    {board.isError && mode === "server" && <div className="lb-status" role="status">Общая таблица недоступна. Показаны записи на устройстве. <button className="text-button" onClick={() => void board.refetch()}>Повторить</button></div>}
    {!showLocal && board.isPending ? <p className="game-side-p" role="status">Загружаем рекорды…</p> : rows.length === 0 ? <p className="game-side-p">Пока нет записей. Завершите партию и сохраните результат.</p> : <ol className="lb-list">{rows.map((row) => <li key={`${row.rank}-${row.name}-${row.ts}`} className={row.mine ? "lb-row lb-mine" : "lb-row"}><span className="lb-rank">{String(row.rank).padStart(2, "0")}</span><span className="lb-name">{row.name}</span><b className="lb-score">{row.score}</b></li>)}</ol>}
    {me && !rows.some((row) => row.mine) && <p className="lb-status">Ваш лучший: <b>{me.score}</b> (#{me.rank})</p>}
  </div>;
}
