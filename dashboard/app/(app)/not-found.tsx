import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card card-pad">
      <h1>Не найдено</h1>
      <p className="muted" style={{ marginTop: 6 }}>
        Такой страницы или ролика нет.{' '}
        <Link href="/" className="link">
          На обзор
        </Link>
      </p>
    </div>
  );
}
