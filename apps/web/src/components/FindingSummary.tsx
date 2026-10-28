import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { getRepository } from '../fixtures/mock/data';
import type { FindingFixture } from '../fixtures/mock/types';
import { SeverityPill } from './ui';

export function FindingSummary({ finding }: { finding: FindingFixture }) {
  const repository = getRepository(finding.repositoryId);

  return (
    <Link className="finding-summary" to={`/findings/${finding.id}`}>
      <div className="finding-summary-main">
        <SeverityPill severity={finding.severity} />
        <div className="finding-summary-copy">
          <strong>{finding.title}</strong>
          <span>
            {repository?.owner}/{repository?.name} · {finding.path}:{finding.line || '—'}
          </span>
        </div>
      </div>
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  );
}
