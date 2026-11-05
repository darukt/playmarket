import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LogIn, LogOut, ShieldCheck, UserRound, X } from 'lucide-react';
import { useSession } from '../hooks/useSession';
import { api } from '../services/api';

export default function AccountPanel() {
  const { data: session, isPending, isError, refetch, mutate, readSession } = useSession();
  const [oauthResult] = useState(() => {
    const result = new URL(window.location.href).searchParams.get('auth');
    return result === 'error' || result === 'success' ? result : null;
  });
  const [open, setOpen] = useState(oauthResult !== null);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(oauthResult === 'error' ? 'Google не подтвердил вход. Попробуйте снова.' : '');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) { if (!dialog.current?.open) dialog.current?.showModal(); }
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const auth = url.searchParams.get('auth');
    if (auth !== 'error' && auth !== 'success') return;
    url.searchParams.delete('auth');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, []);
  function close() { dialog.current?.close(); setOpen(false); setError(''); trigger.current?.focus(); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const password = String(values.get('password') ?? '');
    const name = String(values.get('name') ?? '').trim();
    if (register && ([...password].length < 12 || new TextEncoder().encode(password).length > 1024 || !name || [...name].length > 64)) {
      setError('Укажите имя до 64 символов и пароль не короче 12 символов.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      await mutate(register ? 'register' : 'login', {
        email: String(values.get('email') ?? '').trim(), password,
        ...(register ? { name } : {}),
      });
      form.reset();
      setNotice(register ? 'Аккаунт создан.' : 'Вы вошли в аккаунт.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Нет соединения с сервером.'); }
    finally { setBusy(false); }
  }
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !session) return;
    const form = event.currentTarget;
    const secret = String(new FormData(form).get('deviceKey') ?? '');
    form.reset(); setBusy(true); setError('');
    try {
      const fresh = await readSession();
      const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': fresh.csrfToken } };
      const { challenge } = await api<{ challenge: string }>('/api/auth/admin/challenge', { ...options, body: '{}' });
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(challenge));
      const proof = Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
      await mutate('admin/verify', { proof });
      setNotice('Устройство подтверждено на 5 минут.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось подтвердить устройство.'); }
    finally { setBusy(false); }
  }
  return <>
    <button ref={trigger} className="account-trigger" onClick={() => { setOpen(true); setNotice(''); }} aria-label={session?.user ? 'Открыть аккаунт' : 'Войти или зарегистрироваться'}>
      <UserRound size={17} aria-hidden="true" /><span>{session?.user?.name || 'Войти'}</span>
    </button>
    <dialog ref={dialog} className="account-dialog" onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === dialog.current) { const bounds = dialog.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close(); } }} aria-labelledby="account-heading">
      <div className="account-head"><h2 id="account-heading">{session?.user ? 'Ваш аккаунт' : register ? 'Создать аккаунт' : 'С возвращением'}</h2><button className="icon-btn" onClick={close} aria-label="Закрыть"><X size={20} /></button></div>
      {isPending && <p role="status">Подключаемся…</p>}
      {isError && <div role="alert"><p>Не удалось подключиться. Проверьте соединение.</p><button className="btn" onClick={() => void refetch()}>Повторить</button></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {session && !session.user && <>
        <p className="account-intro">Один аккаунт для каталога и игр.</p>
        {session.googleEnabled && <a className="google-login" href="/api/auth/google"><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="currentColor" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38c-.23 1.25-.94 2.31-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.13H3.07v2.59A10 10 0 0 0 12 22ZM6.41 13.91a6 6 0 0 1 0-3.82V7.5H3.07a10 10 0 0 0 0 9l3.34-2.59ZM12 5.96c1.47 0 2.79.51 3.83 1.51L18.7 4.6A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.5l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z" /></svg>Продолжить с Google</a>}
        <form className="account-form" onSubmit={(e) => void submit(e)}>
          {register && <label>Имя<input name="name" autoComplete="name" required maxLength={64} /></label>}
          <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Пароль<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : 1} maxLength={128} aria-describedby={register ? 'password-hint' : undefined} /></label>
          {register && <p id="password-hint" className="field-hint">Не менее 12 символов. Можно использовать длинную фразу.</p>}
          <button className="btn account-submit" disabled={busy}>{busy ? 'Подождите…' : <><LogIn size={16} />{register ? 'Зарегистрироваться' : 'Войти'}</>}</button>
        </form>
        <button className="text-button" disabled={busy} onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</button>
      </>}
      {session?.user && <>
        <p className="account-name">{session.user.name}</p><p className="account-email">{session.user.email}</p>
        {session.user.role === 'admin' && (session.adminUnlocked ? <p className="form-notice"><ShieldCheck size={17} /> Устройство подтверждено</p> : <form className="account-form" onSubmit={(e) => void unlock(e)}><label>Ключ устройства<input name="deviceKey" type="password" autoComplete="off" required minLength={32} /></label><button className="btn" disabled={busy}>Подтвердить устройство</button></form>)}
        <button className="btn btn-ghost" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await mutate('logout'); setNotice('Вы вышли.'); } catch (err) { setError(err instanceof Error ? err.message : 'Не удалось выйти.'); } finally { setBusy(false); } }}><LogOut size={16} />Выйти</button>
      </>}
    </dialog>
  </>;
}
