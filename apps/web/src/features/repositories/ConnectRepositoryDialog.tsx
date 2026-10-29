import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  createRepositoryResponseSchema,
  dataResponseSchema,
  pairingResponseSchema,
} from '@sentinel/contracts';
import { Button, Callout } from '../../components/ui';
import { useAuth } from '../../components/AuthContext';
import { useWorkspace } from '../../components/WorkspaceContext';
import { apiPost } from '../../lib/api';
import { keepPairing } from '../../lib/pairing';

export function ConnectRepositoryDialog({
  open,
  onClose,
  onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [repositoryPath, setRepositoryPath] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const auth = useAuth();
  const workspace = useWorkspace();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const [owner, name, ...extra] = repositoryPath.trim().split('/');
    if (
      !owner ||
      !name ||
      extra.length > 0 ||
      !/^[A-Za-z0-9_.-]+$/u.test(owner) ||
      !/^[A-Za-z0-9_.-]+$/u.test(name)
    ) {
      setError('Masukkan owner dan nama repo dengan format owner/repo.');
      return;
    }
    setError('');
    setBusy(true);
    if (auth.configured) {
      const organizationId = workspace?.activeOrganization?.id;
      if (!organizationId) {
        setError('Pilih organisasi sebelum mendaftarkan repositori.');
        setBusy(false);
        return;
      }
      let repositoryId: string;
      try {
        const created = await apiPost(
          '/v1/repositories',
          dataResponseSchema(createRepositoryResponseSchema),
          {
            organizationId,
            fullName: `${owner}/${name}`,
            defaultBranch: defaultBranch.trim(),
          },
        );
        repositoryId = created.data.id;
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Repositori belum dapat didaftarkan.',
        );
        setBusy(false);
        return;
      }

      try {
        const pairing = await apiPost(
          `/v1/repositories/${repositoryId}/pairing`,
          dataResponseSchema(pairingResponseSchema),
          {},
        );
        keepPairing(pairing.data);
        onCompleted();
        onClose();
        navigate(`/repositories/${repositoryId}`);
      } catch {
        onCompleted();
        onClose();
        navigate(`/repositories/${repositoryId}`, { state: { pairingError: true } });
      }
      setBusy(false);
      return;
    }

    onCompleted();
    onClose();
    navigate('/repositories/new-pending', {
      state: { owner, name, defaultBranch: defaultBranch.trim() },
    });
    setBusy(false);
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog-card"
      aria-labelledby="connect-repository-title"
      onClose={onClose}
    >
      <div className="dialog-heading">
        <div>
          <p className="eyebrow">HUBUNGKAN REPOSITORI</p>
          <h2 id="connect-repository-title">Tambahkan repositori</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Tutup" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="dialog-description">
        Daftarkan repositori yang kamu kelola. Sentinel tidak akan memasang workflow atau memindai
        kode secara otomatis.
      </p>
      <Callout tone="info" className="dialog-callout">
        Nama repositori bukan bukti kepemilikan. Status tetap menunggu sampai identitas workflow dan
        pairing diverifikasi.
      </Callout>
      <form className="dialog-form" onSubmit={handleSubmit}>
        <label htmlFor="repository-path">Owner/repo</label>
        <div className="input-with-icon">
          <LockKeyhole size={16} aria-hidden="true" />
          <input
            id="repository-path"
            autoComplete="off"
            placeholder="contoh-org/api-service"
            value={repositoryPath}
            onChange={(event) => setRepositoryPath(event.currentTarget.value)}
            aria-describedby={error ? 'repository-path-error' : 'repository-path-hint'}
            aria-invalid={Boolean(error)}
            required
          />
        </div>
        <label htmlFor="repository-default-branch">Branch default</label>
        <div className="input-with-icon">
          <input
            id="repository-default-branch"
            autoComplete="off"
            value={defaultBranch}
            onChange={(event) => setDefaultBranch(event.currentTarget.value)}
            maxLength={255}
            required
          />
        </div>
        <p className="form-hint">
          Nilai ini kamu nyatakan saat setup dan belum diverifikasi terhadap pengaturan GitHub.
        </p>
        {error ? (
          <p className="form-error" id="repository-path-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="form-hint" id="repository-path-hint">
            Gunakan format singkat owner/repo, bukan URL publik.
          </p>
        )}
        <div className="dialog-actions">
          <Button type="button" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Mendaftarkan…' : 'Lanjutkan'} <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </form>
    </dialog>
  );
}
