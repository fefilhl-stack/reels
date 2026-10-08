'use client';

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="card card-pad stack">
      <h1>Что-то пошло не так</h1>
      <p className="muted">{error.message}</p>
      <div>
        <button className="btn" onClick={() => retry()}>
          Попробовать снова
        </button>
      </div>
    </div>
  );
}
