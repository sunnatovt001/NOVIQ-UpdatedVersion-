import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/src/contexts/LocaleContext';
import { getMongoSession, loginMongoAccount, loginMongoTelegram, logoutMongoAccount, type MongoAccount } from '@/src/lib/mongoAuthApi';
import { TelegramLoginWidget } from './TelegramLoginWidget';

const copy = {
  en: { title: 'Backend verification', warning: 'Staging verification only. The main app has not switched to MongoDB.', email: 'Email', password: 'Password', login: 'Sign in', logout: 'Sign out', busy: 'Please wait…', error: 'Verification failed. Check your sign-in details or try again later.', admin: 'Admin access verified', ordinary: 'Signed in without admin access', users: 'Accounts', refresh: 'Check again', back: 'Back to app' },
  uz: { title: 'Backend tekshiruvi', warning: 'Faqat staging tekshiruvi. Asosiy sayt hali MongoDB’ga o‘tmagan.', email: 'Email', password: 'Parol', login: 'Kirish', logout: 'Chiqish', busy: 'Kuting…', error: 'Tekshiruv bajarilmadi. Kirish ma’lumotlarini tekshiring yoki keyinroq qayta urinib ko‘ring.', admin: 'Admin ruxsati tasdiqlandi', ordinary: 'Admin ruxsatisiz kirildi', users: 'Hisoblar', refresh: 'Qayta tekshirish', back: 'Saytga qaytish' },
  ru: { title: 'Проверка сервера', warning: 'Только проверка staging. Основное приложение ещё не переведено на MongoDB.', email: 'Email', password: 'Пароль', login: 'Войти', logout: 'Выйти', busy: 'Подождите…', error: 'Проверка не выполнена. Проверьте данные входа или повторите позже.', admin: 'Доступ администратора подтверждён', ordinary: 'Вход без прав администратора', users: 'Учётные записи', refresh: 'Проверить снова', back: 'Вернуться в приложение' },
};
type AdminAccount = { uid: string; email: string | null; displayName: string; disabled: boolean };
export function MongoBackendCheck() {
  const { locale } = useLocale(); const text = copy[locale];
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [user, setUser] = useState<MongoAccount | null>(null), [admin, setAdmin] = useState(false);
  const [users, setUsers] = useState<AdminAccount[]>([]), [busy, setBusy] = useState(true), [failed, setFailed] = useState(false);
  const generation = useRef(0), lock = useRef(false);
  async function refresh(revision: number) {
    const session = await getMongoSession();
    if (generation.current !== revision) return;
    setUser(session.user); setAdmin(session.isAdmin); setUsers([]);
    if (session.isAdmin) {
      const response = await fetch('/api/admin/users', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Admin check failed');
      const result = await response.json();
      if (!Array.isArray(result.users) || result.users.length > 50 || !result.users.every((row: AdminAccount) => row && typeof row.uid === 'string' && (row.email === null || typeof row.email === 'string') && typeof row.displayName === 'string' && typeof row.disabled === 'boolean')) throw new Error('Invalid admin response');
      if (generation.current === revision) setUsers(result.users);
    }
  }
  useEffect(() => {
    const revision = ++generation.current;
    // Signed-out 401 is expected on first visit, not a successful verification.
    refresh(revision).catch(error => { if (generation.current === revision && error?.status !== 401) setFailed(true); }).finally(() => { if (generation.current === revision) setBusy(false); });
    return () => { generation.current++; };
  }, []);
  async function run(operation: 'login' | 'logout' | 'refresh' | 'telegram', proof?: Record<string, unknown>) {
    if (lock.current) return; lock.current = true;
    const revision = ++generation.current; setBusy(true); setFailed(false); setUsers([]);
    try {
      if (operation === 'logout') { await logoutMongoAccount(); if (generation.current === revision) { setUser(null); setAdmin(false); } }
      else {
        if (operation === 'login') { await loginMongoAccount(email, password); setPassword(''); }
        if (operation === 'telegram') { if (!proof) throw new Error('Missing proof'); await loginMongoTelegram(proof); }
        await refresh(revision);
      }
    } catch { if (generation.current === revision) { setFailed(true); setUser(null); setAdmin(false); } }
    finally { if (generation.current === revision) { setBusy(false); lock.current = false; } }
  }
  return <main className="min-h-screen p-4 sm:p-8" style={{ background: 'var(--noviq-bg, #f7f8f6)', color: 'var(--noviq-text, #14213d)' }}>
    <section className="mx-auto max-w-xl space-y-5 rounded-2xl border p-5" style={{ background: 'var(--noviq-card, #fff)', borderColor: 'var(--noviq-border, #d8dee7)' }}>
      <h1 className="text-2xl font-semibold">{text.title}</h1><p>{text.warning}</p>
      <a className="underline" href="/">{text.back}</a>
      {failed ? <p role="alert">{text.error}</p> : null}
      {user ? <>
        <p role="status">{admin ? text.admin : text.ordinary}</p><p className="break-all">{user.email}</p>
        <div className="flex flex-wrap gap-3"><button className="btn-secondary min-h-11" disabled={busy} onClick={() => void run('refresh')}>{text.refresh}</button><button className="btn-secondary min-h-11" disabled={busy} onClick={() => void run('logout')}>{text.logout}</button></div>
        {admin ? <section aria-label={text.users}><h2 className="text-lg font-semibold">{text.users} ({users.length})</h2><ul>{users.map(account => <li className="break-all border-b py-3" key={account.uid}>{account.displayName} — {account.email}</li>)}</ul></section> : null}
      </> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); void run('login'); }}>
        <label className="block">{text.email}<input className="mt-2 min-h-11 w-full rounded-lg border bg-transparent px-3" name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label className="block">{text.password}<input className="mt-2 min-h-11 w-full rounded-lg border bg-transparent px-3" name="password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} /></label>
        <button className="btn-primary min-h-11" disabled={busy || !email.trim() || !password} type="submit">{busy ? text.busy : text.login}</button>
      </form>}
      {!user && !busy ? <TelegramLoginWidget onProof={proof => void run('telegram', proof)} errorText={text.error} /> : null}
      {busy ? <p role="status">{text.busy}</p> : null}
    </section>
  </main>;
}
