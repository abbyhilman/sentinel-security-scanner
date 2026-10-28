import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { usePreviewState } from './PreviewContext';
import { EmptyState, FeedbackState, LoadingState } from './ui';

export function PreviewStateGate({
  children,
  emptyTitle = 'Belum ada data untuk ditampilkan',
  emptyDescription = 'Tambahkan repositori milikmu untuk mulai menyiapkan workflow pemeriksaan.',
  emptyAction,
}: {
  children: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}) {
  const state = usePreviewState();
  const [, setSearchParams] = useSearchParams();

  if (state === 'loading') return <LoadingState />;

  if (state === 'unauthorized' || state === 'error') {
    return <FeedbackState kind={state} onRetry={() => setSearchParams({}, { replace: true })} />;
  }

  if (state === 'no-data') {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return <>{children}</>;
}
