import { AlertCircle, RotateCw, ShieldAlert } from 'lucide-react';
import { Button, EmptyState, LoadingState } from './ui';

export function ApiLoading({ title = 'Memuat data live' }: { title?: string }) {
  return <LoadingState title={title} />;
}

export function ApiErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const denied = 'status' in error && error.status === 403;
  return (
    <section className="api-error-state" role="alert">
      <div className="feedback-icon" aria-hidden="true">
        {denied ? <ShieldAlert size={22} /> : <AlertCircle size={22} />}
      </div>
      <p className="eyebrow">{denied ? 'AKSES TERBATAS' : 'DATA BELUM TERSEDIA'}</p>
      <h2>{denied ? 'Akses organisasi ditolak' : 'Layanan belum dapat memuat data'}</h2>
      <p>{error.message}</p>
      <Button type="button" onClick={onRetry}>
        <RotateCw size={15} aria-hidden="true" /> Coba lagi
      </Button>
    </section>
  );
}

export function ApiEmptyState({ title, description }: { title: string; description: string }) {
  return <EmptyState title={title} description={description} />;
}
