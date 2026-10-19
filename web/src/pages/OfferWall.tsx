import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatCents } from '../api';
import { OfferArt, offerArt } from '../components/OfferArt';

type Props = { userId: string };

export function OfferWall({ userId }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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

  const available = offers?.reduce((sum, o) => sum + o.milestones.reduce((s, m) => s + m.payoutCents, 0), 0) ?? 0;

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Live demo · rewarded user acquisition</span>
          <h1>
            Get paid to play.
            <br />
            <span className="accent">Exactly once.</span>
          </h1>
          <p className="lead">
            Studios pay to find new players. You install a game, hit a milestone, and the studio's tracker tells us.
            We pay you instantly, even when that report arrives twice, late, out of order or forged.
          </p>
          <div className="hero-actions">
            <a href="#offers" className="btn btn-primary">
              Browse offers
            </a>
            <Link to="/demo" className="btn btn-ghost">
              Try to break it →
            </Link>
          </div>
        </div>
        <div className="hero-stats">
          <Stat value={formatCents(available)} label="available to earn" />
          <Stat value={String(offers?.length ?? 0)} label="games live now" />
          <Stat value="0" label="double payouts, by design" />
        </div>
      </section>

      <section className="steps" aria-label="How it works">
        <Step n={1} title="Start an offer" text="Pick a game. We create a tracking link that is unique to you." />
        <Step n={2} title="Play and hit milestones" text="The studio's tracker reports each level you reach." />
        <Step n={3} title="Get paid, once" text="We verify the report and credit your wallet live. Duplicates are ignored." />
      </section>

      <section id="offers">
        <div className="section-head">
          <h2>Featured offers</h2>
          <span className="muted">Playing as {userId.replace('user_', '')}</span>
        </div>

        {isLoading && <OfferSkeletons />}
        {error && (
          <div className="notice error">
            Couldn't load offers: {(error as Error).message}. Is the API running?
          </div>
        )}
        {start.error && <div className="notice error">Couldn't start the offer: {(start.error as Error).message}</div>}

        <div className="offer-grid">
          {offers?.map((offer) => {
            const total = offer.milestones.reduce((sum, m) => sum + m.payoutCents, 0);
            const earned = offer.milestones.filter((m) => m.credited).reduce((sum, m) => sum + m.payoutCents, 0);
            const done = offer.milestones.filter((m) => m.credited).length;
            return (
              <article key={offer.id} className="offer-card">
                <div className="offer-top">
                  <OfferArt id={offer.id} />
                  <span className="chip genre">{offerArt(offer.id).genre}</span>
                  <span className="payout-badge">
                    <small>up to</small>
                    {formatCents(total)}
                  </span>
                </div>

                <div className="offer-body">
                  <h3>{offer.title}</h3>
                  <p className="muted">{offer.description}</p>

                  <ul className="milestones">
                    {offer.milestones.map((m) => (
                      <li key={m.id} className={m.credited ? 'done' : undefined}>
                        <span className="check" aria-hidden>
                          {m.credited ? '✓' : ''}
                        </span>
                        <span className="m-label">
                          {m.label}
                          {m.credited && <span className="visually-hidden"> (paid)</span>}
                        </span>
                        <strong className="m-pay">{formatCents(m.payoutCents)}</strong>
                      </li>
                    ))}
                  </ul>

                  {offer.started && (
                    <div className="progress" aria-label={`${done} of ${offer.milestones.length} milestones paid`}>
                      <div className="progress-bar" style={{ width: `${(earned / total) * 100}%` }} />
                      <span>
                        {formatCents(earned)} of {formatCents(total)} earned
                      </span>
                    </div>
                  )}

                  {offer.started ? (
                    <button className="btn btn-secondary" onClick={() => navigate('/demo')}>
                      Continue · simulate progress →
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => start.mutate(offer.id)}
                      disabled={start.isPending}
                    >
                      Start offer
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="step">
      <span className="step-n">{n}</span>
      <div>
        <h3>{title}</h3>
        <p className="muted">{text}</p>
      </div>
    </div>
  );
}

function OfferSkeletons() {
  return (
    <div className="offer-grid" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="offer-card skeleton" />
      ))}
    </div>
  );
}
