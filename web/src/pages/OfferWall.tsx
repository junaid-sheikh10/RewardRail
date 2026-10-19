import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, formatCents } from '../api';

type Props = { userId: string };

export function OfferWall({ userId }: Props) {
  const queryClient = useQueryClient();
  const { data: offers, isLoading, error } = useQuery({
    queryKey: ['offers', userId],
    queryFn: () => api.offersForUser(userId),
  });

  // The server returns the existing click if the offer was already started, so a
  // double tap is harmless.
  const start = useMutation({
    mutationFn: (offerId: string) => api.startOffer(userId, offerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offers', userId] }),
  });

  if (isLoading) return <p className="muted">Loading offers…</p>;
  if (error) {
    return (
      <p className="error">
        Couldn't load offers: {(error as Error).message}. Is the API running on port 3000?
      </p>
    );
  }
  if (!offers?.length) return <p className="muted">No offers yet. Run the seed: npm run db:seed --workspace api</p>;

  return (
    <section>
      <h1>Offers</h1>
      <p className="muted">Try a game, hit the milestones, get paid. Signed in as {userId}.</p>
      {start.error && <p className="error">Couldn't start the offer: {(start.error as Error).message}</p>}

      <div className="grid">
        {offers.map((offer) => {
          const total = offer.milestones.reduce((sum, m) => sum + m.payoutCents, 0);
          const earned = offer.milestones.filter((m) => m.credited).reduce((sum, m) => sum + m.payoutCents, 0);
          return (
            <article key={offer.id} className="card">
              <header className="card-head">
                <h2>{offer.title}</h2>
                <span className="pill">
                  {earned > 0 ? `${formatCents(earned)} of ${formatCents(total)}` : `up to ${formatCents(total)}`}
                </span>
              </header>
              <p className="muted">{offer.description}</p>

              <ul className="milestones">
                {offer.milestones.map((m) => (
                  <li key={m.id} className={m.credited ? 'done' : undefined}>
                    <span className={m.credited ? 'dot filled' : 'dot'} aria-hidden />
                    <span>
                      {m.label}
                      {m.credited && <span className="visually-hidden"> (paid)</span>}
                    </span>
                    <strong>{formatCents(m.payoutCents)}</strong>
                  </li>
                ))}
              </ul>

              {offer.started ? (
                <div className="started">
                  <span>Started ✓</span>
                  <Link to="/demo">Simulate progress →</Link>
                </div>
              ) : (
                <button onClick={() => start.mutate(offer.id)} disabled={start.isPending}>
                  Start offer
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
