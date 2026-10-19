import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type ClaimStatus } from '../api';
import { OfferArt } from '../components/OfferArt';

// A simple admin view of claims. Open in this demo (no auth), see the README.
export function SupportQueue() {
  const [filter, setFilter] = useState<ClaimStatus | 'all'>('needs_human');
  const claims = useQuery({
    queryKey: ['claims', filter],
    queryFn: () => api.claims(filter === 'all' ? undefined : filter),
  });

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Internal · support team</span>
        <h1>Support queue</h1>
        <p className="lead">
          "I wasn't paid" claims that our automatic checks couldn't settle. Nothing here can pay anyone: money only moves
          through a studio's signed report.
        </p>
      </div>

      <div className="tabs" role="tablist">
        {(['needs_human', 'resolved', 'all'] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={filter === f ? 'tab active' : 'tab'}
            onClick={() => setFilter(f)}
          >
            {f === 'needs_human' ? 'Needs a person' : f === 'resolved' ? 'Answered' : 'All'}
          </button>
        ))}
        <button className="tab" onClick={() => claims.refetch()}>
          ↻ Refresh
        </button>
      </div>

      {claims.isLoading && <p className="muted">Loading…</p>}
      {claims.error && <div className="notice error">{(claims.error as Error).message}</div>}
      {claims.data && claims.data.length === 0 && (
        <div className="card empty">
          <span className="empty-icon" aria-hidden>
            🎉
          </span>
          <p>Nothing waiting. File a claim from the Wallet page to see it here.</p>
        </div>
      )}

      <ul className="claims">
        {claims.data?.map((c) => (
          <li key={c.id} className="card claim-card">
            <OfferArt id={c.offerId} size="small" />
            <div className="claim-main">
              <div className="row-between">
                <strong>
                  {c.user?.displayName ?? c.userId} · {c.offer?.title ?? c.offerId}
                </strong>
                <span className={`chip ${c.status === 'resolved' ? 'chip-green' : 'chip-muted'}`}>
                  {c.status === 'resolved' ? 'Answered' : 'Needs a person'}
                </span>
              </div>
              <p className="quote">“{c.message}”</p>
              <p className="small">
                <span className="muted">Reply: </span>
                {c.reply}
              </p>
              <p className="muted small">
                {new Date(c.createdAt).toLocaleString()} · {c.category.replace(/_/g, ' ')} · by {c.source}
                {c.confidence !== null && ` · confidence ${c.confidence.toFixed(2)}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
