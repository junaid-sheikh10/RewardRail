import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type ClaimStatus } from '../api';

// A simple admin view of claims. Open in this demo (no auth), see the README.
export function SupportQueue() {
  const [filter, setFilter] = useState<ClaimStatus | 'all'>('needs_human');
  const claims = useQuery({
    queryKey: ['claims', filter],
    queryFn: () => api.claims(filter === 'all' ? undefined : filter),
  });

  return (
    <section>
      <h1>Support queue</h1>
      <p className="muted">
        Claims the automatic checks couldn't settle wait here. Nothing on this page can pay anyone: money moves only through
        signed advertiser reports.
      </p>

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
        <button className="secondary" onClick={() => claims.refetch()}>
          Refresh
        </button>
      </div>

      {claims.isLoading && <p className="muted">Loading…</p>}
      {claims.error && <p className="error">{(claims.error as Error).message}</p>}
      {claims.data && claims.data.length === 0 && <p className="muted">Nothing here.</p>}

      {claims.data && claims.data.length > 0 && (
        <table className="table claims-table">
          <thead>
            <tr>
              <th>When</th>
              <th>User · Offer</th>
              <th>Claim</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {claims.data.map((c) => (
              <tr key={c.id}>
                <td className="muted">{new Date(c.createdAt).toLocaleString()}</td>
                <td>
                  {c.user?.displayName ?? c.userId}
                  <div className="muted small">{c.offer?.title ?? c.offerId}</div>
                </td>
                <td>{c.message}</td>
                <td>
                  <span className={`tag ${c.status}`}>{c.status === 'resolved' ? 'answered' : 'needs a person'}</span>
                  <div className="muted small">
                    {c.category.replace(/_/g, ' ')} · {c.source}
                    {c.confidence !== null && ` · confidence ${c.confidence.toFixed(2)}`}
                  </div>
                  <div className="small">{c.reply}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
