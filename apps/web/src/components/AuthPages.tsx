import { useState, type FormEvent } from 'react';
import { ArrowRight, GitBranch, LockKeyhole, Mail } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router';
import { dataResponseSchema, organizationSchema } from '@sentinel/contracts';
import { useAuth } from './AuthContext';
import { useWorkspace } from './WorkspaceContext';
import { apiPost } from '../lib/api';
import { Button, FullScreenLoadingState } from './ui';

function getReturnPath(state: unknown) {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const from = (state as { from?: unknown }).from;
    if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) return from;
  }
  return '/overview';
}

export function AuthCallbackPage() {
  const auth = useAuth();
  const location = useLocation();
  const returnPath = getReturnPath(location.state);
  if (!auth.configured) return <Navigate to="/overview" replace />;
  if (!auth.loading && auth.session) return <Navigate to={returnPath} replace />;
  if (!auth.loading && !auth.session) return <Navigate to="/login" replace />;
  return <FullScreenLoadingState title="Memverifikasi sesi" />;
}

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'email' | 'github' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const returnPath = getReturnPath(location.state);

  if (!auth.configured) return <Navigate to="/overview" replace />;
  if (auth.loading) return <FullScreenLoadingState title="Memeriksa sesi" />;
  if (auth.session) return <Navigate to={returnPath} replace />;

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('email');
    setError('');
    setMessage('');
    try {
      await auth.sendMagicLink(email.trim());
      setMessage('Tautan masuk sudah dikirim. Periksa email dan buka tautan dari perangkat ini.');
    } catch {
      setError('Tautan masuk belum dapat dikirim. Periksa alamat email dan konfigurasi Auth.');
    } finally {
      setBusy(null);
    }
  };

  const signInWithGitHub = async () => {
    setBusy('github');
    setError('');
    try {
      await auth.signInWithGitHub();
    } catch {
      setError(
        'GitHub sign-in belum tersedia. Pastikan provider OAuth sudah dikonfigurasi di Supabase.',
      );
      setBusy(null);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="login-title">
        <Link
          to="/overview"
          className="brand-wordmark auth-brand"
          aria-label="Sentinel Security Scanner"
        >
          <span className="sr-only">Sentinel Security Scanner</span>
        </Link>
        <p className="eyebrow">RUANG KERJA SENTINEL</p>
        <h1 id="login-title">Masuk untuk melihat laporan</h1>
        <p className="auth-description">
          Gunakan email atau akun GitHub yang sudah diizinkan di Supabase.
        </p>

        <button
          className="btn btn-secondary auth-provider-button"
          type="button"
          onClick={signInWithGitHub}
          disabled={busy !== null}
        >
          <GitBranch size={17} aria-hidden="true" />
          {busy === 'github' ? 'Menghubungkan ke GitHub…' : 'Lanjutkan dengan GitHub'}
        </button>

        <div className="auth-divider">
          <span>atau gunakan email</span>
        </div>

        <form className="auth-form" onSubmit={submitEmail}>
          <label htmlFor="login-email">Email</label>
          <div className="auth-input-wrap">
            <Mail size={16} aria-hidden="true" />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="nama@contoh.com"
            />
          </div>
          <button className="btn btn-primary auth-submit" type="submit" disabled={busy !== null}>
            <LockKeyhole size={15} aria-hidden="true" />
            {busy === 'email' ? 'Mengirim tautan…' : 'Kirim tautan masuk'}
          </button>
        </form>

        {message && (
          <p className="auth-success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <p className="auth-footnote">
          Data dashboard dibaca dengan sesi pengguna dan kebijakan akses organisasi.
        </p>
      </section>
    </main>
  );
}

export function CreateOrganizationPage() {
  const workspace = useWorkspace();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!workspace) return null;
  const createOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await apiPost('/v1/organizations', dataResponseSchema(organizationSchema), {
        name: name.trim(),
      });
      workspace.reloadOrganizations();
      workspace.selectOrganization(response.data.id);
    } catch {
      setError('Ruang kerja belum dapat dibuat. Periksa sesi dan coba kembali.');
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="organization-title">
        <Link
          to="/overview"
          className="brand-wordmark auth-brand"
          aria-label="Sentinel Security Scanner"
        >
          <span className="sr-only">Sentinel Security Scanner</span>
        </Link>
        <p className="eyebrow">PENYIAPAN ORGANISASI</p>
        <h1 id="organization-title">Buat ruang kerja pertama</h1>
        <p className="auth-description">
          Repositori dan laporan akan berada di bawah organisasi ini.
        </p>
        <form className="auth-form" onSubmit={createOrganization}>
          <label htmlFor="organization-name">Nama organisasi</label>
          <div className="auth-input-wrap">
            <input
              id="organization-name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              maxLength={160}
              required
              autoComplete="organization"
              placeholder="Contoh: Tim Platform"
            />
          </div>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Membuat ruang kerja…' : 'Buat ruang kerja'}{' '}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </form>
      </section>
    </main>
  );
}

export function WorkspaceLoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <main className="auth-screen">
      <section className="auth-card" role="alert" aria-labelledby="workspace-load-title">
        <p className="eyebrow">RUANG KERJA SENTINEL</p>
        <h1 id="workspace-load-title">Organisasi belum dapat dimuat</h1>
        <p className="auth-description">{error.message}</p>
        <Button type="button" variant="primary" onClick={onRetry}>
          Coba lagi
        </Button>
      </section>
    </main>
  );
}
