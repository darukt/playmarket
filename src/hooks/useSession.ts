import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export interface Session {
  user: { id: string; email: string; name: string; role: string } | null;
  csrfToken: string;
  googleEnabled: boolean;
  adminUnlocked: boolean;
}
const sessionKey = ['session'] as const;
const sessionQuery = ({ signal }: { signal: AbortSignal }) => api<Session>('/api/auth/session', { signal });

export function useSession() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: sessionKey, queryFn: sessionQuery, staleTime: 30_000, refetchOnWindowFocus: true });
  async function readSession() {
    // Recheck the server session: a process restart or cookie expiry invalidates cached CSRF.
    await client.cancelQueries({ queryKey: sessionKey });
    return client.fetchQuery({ queryKey: sessionKey, queryFn: sessionQuery, staleTime: 0 });
  }
  async function mutate(action: string, body: unknown = {}) {
    const session = await readSession();
    const result = await api<Session>(`/api/auth/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
      body: JSON.stringify(body),
    });
    // A read started before login/logout must never overwrite the new user/CSRF.
    await client.cancelQueries({ queryKey: sessionKey });
    client.setQueryData(sessionKey, result);
    return result;
  }
  return { ...query, mutate, readSession };
}
