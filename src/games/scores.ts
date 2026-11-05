export interface ScoreRow { rank: number; name: string; score: number; ts: number; mine?: boolean; }

export function validScoreRows(value: unknown): ScoreRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is ScoreRow => Boolean(row) && typeof row === "object" &&
    typeof row.name === "string" && row.name.length <= 80 && Number.isSafeInteger(row.score) && row.score >= 0 &&
    Number.isSafeInteger(row.rank) && row.rank > 0 && Number.isFinite(row.ts)).slice(0, 10);
}

export function mergeLocalScore(rows: ScoreRow[], name: string, score: number, now: number): ScoreRow[] {
  const previous = rows.filter((row) => row.mine).sort((a, b) => b.score - a.score)[0];
  const mine = previous && previous.score >= score ? previous : { rank: 1, name, score, ts: now, mine: true };
  return [...rows.filter((row) => !row.mine), mine].sort((a, b) => b.score - a.score).slice(0, 10).map((row, i) => ({ ...row, rank: i + 1 }));
}
