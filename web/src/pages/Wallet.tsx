import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, formatCents } from '../api';
import { OfferArt } from '../components/OfferArt';
import { useCountUp } from '../components/useCountUp';
import { MissingReward } from './MissingReward';

type Props = { userId: string };

export function Wallet({ userId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['wallet', userId],
    queryFn: () => api.wallet(userId),
  });
  const offers = useQuery({ queryKey: ['offers-all'], queryFn: api.offers });
  const balance = useCountUp(data?.balanceCents);

  // Map titles back to offer ids for the artwork in the history list.
  const idByTitle = new Map(offers.data?.map((o) => [o.title, o.id]));

  if (error) return <div className="notice error">Couldn't load the wallet: {(error as Error).message}</div>;

  return (
    <div className="wallet-page">
      <section className="balance-hero">
        <span className="eyebrow">Available balance</span>
        <strong className="balance-big">{isLoading ? '…' : formatCents(balance)}</strong>
        <p className="muted">
          Always the sum of the entries below. There is no stored balance that could drift.
        </p>
        <div className="balance-meta">
          <span className="chip">{data?.entries.length ?? 0} rewards</span>
          <button className="btn btn-secondary" disabled title="Cash-outs are on the roadmap">
            Cash out · soon
          </button>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Activity</h2>
          <span className="muted">Newest first</span>
        </div>
        {data && data.entries.length === 0 ? (
          <div className="empty">
            <span className="empty-icon" aria-hidden>
              🪙
            </span>
            <p>No earnings yet.</p>
            <Link to="/" className="btn btn-secondary">
              Find an offer
            </Link>
          </div>
        ) : (
          <ul className="activity">
            {data?.entries.map((e) => (
              <li key={e.id}>
                <OfferArt id={idByTitle.get(e.offerTitle ?? '') ?? e.type} size="small" />
                <div className="activity-text">
                  <strong>{e.milestoneLabel ?? e.type}</strong>
                  <span className="muted">
                    {e.offerTitle ?? 'Reward'} · {new Date(e.createdAt).toLocaleString()}
                  </span>
                </div>
                <strong className={e.amountCents < 0 ? 'amount negative' : 'amount'}>
                  {e.amountCents < 0 ? '−' : '+'}
                  {formatCents(Math.abs(e.amountCents))}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MissingReward userId={userId} />
    </div>
  );
}
