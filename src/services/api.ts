/** Public same-origin gateway contract. Internal service addresses never enter the bundle. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/api/')) throw new Error('Invalid API path');
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers,
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: path === '/api/auth/register' ? 'Не удалось создать аккаунт с этими данными. Проверьте email, имя и пароль от 12 символов.' : 'Проверьте заполненные поля и повторите запрос.',
      401: 'Проверьте email и пароль.', 403: 'Доступ запрещён. Обновите страницу и войдите снова.',
      409: 'Не удалось создать аккаунт с этими данными.',
      429: 'Слишком много попыток. Подождите перед повторным входом.',
      503: 'Сервис временно недоступен. Попробуйте позже.',
    };
    throw new ApiError(response.status, messages[response.status] ?? 'Не удалось выполнить запрос. Попробуйте ещё раз.');
  }
  return response.json() as Promise<T>;
}
