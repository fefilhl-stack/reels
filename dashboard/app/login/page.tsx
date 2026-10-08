import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { env } from '@/lib/env';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Вход' };

export default async function LoginPage() {
  await connection(); // the password comes from the runtime env, never from build time
  if (!env.password() || (await isAuthed())) redirect('/');
  return (
    <div className="login">
      <div className="card card-pad stack">
        <div>
          <h1>Reels Hub</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Введите пароль дашборда
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
