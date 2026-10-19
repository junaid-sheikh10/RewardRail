import { useQuery } from '@tanstack/react-query';
import { api, formatCents } from '../api';

type Props = { userId: string };

// Working in Phase 1: lists seeded offers from GET /offers.
// TODO (Phase 4):
// - switch to GET /users/:id/offers to show this user's progress per milestone
// - make "Start offer" call POST /clicks, then show the offer as started
export function OfferWall({ userId }: Props) {
  const { data: offers, isLoading, error } = useQuery({ queryKey: ['offers'], queryFn: api.offers });

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

      <div className="grid">
        {offers.map((offer) => {
          const total = offer.milestones.reduce((sum, m) => sum + m.payoutCents, 0);
          return (
            <article key={offer.id} className="card">
              <header className="card-head">
                <h2>{offer.title}</h2>
                <span className="pill">up to {formatCents(total)}</span>
              </header>
              <p className="muted">{offer.description}</p>

              <ul className="milestones">
                {offer.milestones.map((m) => (
                  <li key={m.id}>
                    <span className="dot" aria-hidden />
                    <span>{m.label}</span>
                    <strong>{formatCents(m.payoutCents)}</strong>
                  </li>
                ))}
              </ul>

              <button disabled title="Coming in Phase 4: creates a click via POST /clicks">
                Start offer
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
