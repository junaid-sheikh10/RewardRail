import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatCents, type SimulatedResult, type SimulateInput } from '../api';
import { OfferArt } from '../components/OfferArt';
import { useCountUp } from '../components/useCountUp';

type Props = { userId: string };

type Tone = 'credited' | 'duplicate' | 'rejected';
type LogEntry = { id: number; time: string; action: string; outcome: { text: string; tone: Tone }[] };
type Job = { action: string; calls: SimulateInput[]; perCall?: boolean };

// The most important screen: it makes the backend's reliability visible.
// The browser never holds POSTBACK_SECRET. Every button asks the dev-only endpoint
// (POST /dev/simulate-postback) to act as the advertiser: the server signs and calls
// our real POST /postbacks over HTTP. That endpoint is switched off in production.
export function DemoPanel({ userId }: Props) {
  const queryClient = useQueryClient();
  const offers = useQuery({ queryKey: ['offers', userId], queryFn: () => api.offersForUser(userId) });
  const wallet = useQuery({ queryKey: ['wallet', userId], queryFn: () => api.wallet(userId) });
  const balance = useCountUp(wallet.data?.balanceCents);

  const started = offers.data?.filter((o) => o.started) ?? [];
  const [offerId, setOfferId] = useState<string>('');
  const [milestoneKey, setMilestoneKey] = useState<string>('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [nextId, setNextId] = useState(0);

  // Keep the selection valid when the user or their started offers change.
  const offer = started.find((o) => o.id === offerId) ?? started[0];
  const milestone = offer?.milestones.find((m) => m.key === milestoneKey) ?? offer?.milestones[0];
  useEffect(() => {
    if (offer && offer.id !== offerId) setOfferId(offer.id);
    if (milestone && milestone.key !== milestoneKey) setMilestoneKey(milestone.key);
  }, [offer, milestone, offerId, milestoneKey]);

  const serverLog = useQuery({
    queryKey: ['postbacks', offer?.clickId],
    queryFn: () => api.postbacks(offer!.clickId!),
    enabled: Boolean(offer?.clickId),
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['wallet', userId] }),
      queryClient.invalidateQueries({ queryKey: ['offers', userId] }),
      queryClient.invalidateQueries({ queryKey: ['postbacks'] }),
    ]);

  const record = (job: Job, results: SimulatedResult[]) => {
    // perCall: one tag per request, labelled with its milestone (so you can see WHICH one paid).
    const outcome = job.perCall
      ? results.map((r, i) => ({ ...describe(r), text: `${job.calls[i].event}: ${describe(r).text}` }))
      : summarise(results);
    setNextId((n) => n + 1);
    setLog((current) => [{ id: nextId, time: new Date().toLocaleTimeString(), action: job.action, outcome }, ...current].slice(0, 30));
  };

  const run = useMutation({
    mutationFn: async (job: Job) => {
      // Sequential between calls (so "out of order" really is in order), parallel inside one call.
      const all: SimulatedResult[] = [];
      for (const call of job.calls) all.push(...(await api.simulatePostback(call)).results);
      return all;
    },
    onSuccess: (results, job) => {
      record(job, results);
      return refresh();
    },
  });

  const reset = useMutation({
    mutationFn: () => api.resetDemo(userId),
    onSuccess: () => {
      setLog([]);
      return refresh();
    },
  });

  const header = (
    <div className="page-head">
      <span className="eyebrow">You are the game studio</span>
      <h1>Advertiser console</h1>
      <p className="lead">
        Send the reports a studio's tracker would send, including the messy ones. Watch the balance: it only ever moves
        once per milestone.
      </p>
    </div>
  );

  if (offers.isLoading) return <p className="muted">Loading…</p>;
  if (offers.error) return <div className="notice error">Couldn't load offers: {(offers.error as Error).message}</div>;

  if (!offer || !milestone) {
    return (
      <>
        {header}
        <div className="card empty">
          <span className="empty-icon" aria-hidden>
            🎮
          </span>
          <p>
            First, start an offer as <strong>{userId.replace('user_', '')}</strong>. The console then sends reports for it.
          </p>
          <Link to="/" className="btn btn-primary">
            Pick a game
          </Link>
        </div>
      </>
    );
  }

  const clickId = offer.clickId!;
  const send = (action: string, ...calls: SimulateInput[]) => run.mutate({ action, calls });
  const sendEach = (action: string, ...calls: SimulateInput[]) => run.mutate({ action, calls, perCall: true });
  const base = { clickId, event: milestone.key, payoutCents: milestone.payoutCents };
  const busy = run.isPending || reset.isPending;
  const reversed = [...offer.milestones].reverse();

  return (
    <>
      {header}

      <section className="console-top">
        <div className="balance-tile">
          <span className="muted small">{userId.replace('user_', '')}'s balance</span>
          <strong>{formatCents(balance)}</strong>
        </div>
        <div className="console-target card">
          <OfferArt id={offer.id} size="small" />
          <label>
            Game
            <select value={offer.id} onChange={(e) => setOfferId(e.target.value)}>
              {started.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Milestone
            <select value={milestone.key} onChange={(e) => setMilestoneKey(e.target.value)}>
              {offer.milestones.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} ({formatCents(m.payoutCents)}){m.credited ? ' ✓ paid' : ''}
                </option>
              ))}
            </select>
          </label>
          <code className="click-id" title="The tracking id the studio sends back with every report">
            {clickId.slice(0, 18)}…
          </code>
        </div>
      </section>

      <section className="scenarios">
        <Scenario
          icon="✅"
          tone="green"
          title="Valid report"
          hint="Correctly signed. Pays the milestone, once."
          disabled={busy}
          onClick={() => send(`Valid report · ${milestone.label}`, base)}
        />
        <Scenario
          icon="⚡"
          tone="violet"
          featured
          title="Same report 20× at once"
          hint="20 simultaneous retries of one event. The balance must rise only once."
          disabled={busy}
          onClick={() => send(`Same report ×20 at once · ${milestone.label}`, { ...base, repeat: 20 })}
        />
        <Scenario
          icon="🔀"
          tone="blue"
          title="Out of order"
          hint="Last milestone first. Each pays once; an already-paid one shows duplicate."
          disabled={busy}
          onClick={() =>
            sendEach(
              'Out of order · ' + reversed.map((m) => m.key).join(' → '),
              ...reversed.map((m) => ({ clickId, event: m.key, payoutCents: m.payoutCents })),
            )
          }
        />
        <Scenario
          icon="🕵️"
          tone="red"
          title="Forged signature"
          hint="An attacker without the secret. Answered 401, nothing stored."
          disabled={busy}
          onClick={() => send('Forged signature', { ...base, validSignature: false })}
        />
        <Scenario
          icon="❓"
          tone="amber"
          title="Unknown click"
          hint="A report for a user we never tracked. Recorded, never paid."
          disabled={busy}
          onClick={() => send('Unknown click', { ...base, clickId: 'clk_does_not_exist' })}
        />
        <Scenario
          icon="💸"
          tone="amber"
          title="Inflated payout"
          hint="The report claims $999.99. We pay our own milestone price."
          disabled={busy}
          onClick={() => send(`Inflated payout · ${milestone.label}`, { ...base, payoutCents: 99_999 })}
        />
      </section>

      {(run.error || reset.error) && <div className="notice error">{((run.error ?? reset.error) as Error).message}</div>}

      <section className="console-grid">
        <div className="card">
          <div className="section-head">
            <h2>Live results</h2>
            <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => reset.mutate()}>
              ↺ Reset demo
            </button>
          </div>
          {log.length === 0 ? (
            <p className="muted">Nothing sent yet. Press a scenario above; start with "Same report 20× at once".</p>
          ) : (
            <ul className="feed">
              {log.map((entry) => (
                <li key={entry.id}>
                  <div className="row-between">
                    <strong>{entry.action}</strong>
                    <span className="muted small">{entry.time}</span>
                  </div>
                  <div className="tags">
                    {entry.outcome.map((o) => (
                      <span key={o.text} className={`tag ${o.tone}`}>
                        {o.text}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="section-head">
            <h2>What the server stored</h2>
            <span className="muted small">for this click</span>
          </div>
          {serverLog.data?.length ? (
            <ul className="stored">
              {serverLog.data.map((p) => (
                <li key={p.id}>
                  <span className={`dot ${p.status}`} aria-hidden />
                  <div>
                    <strong>{p.eventKey}</strong>
                    <span className="muted small"> · {p.eventId.slice(0, 14)}…</span>
                    {p.rejectReason && <div className="muted small">{p.rejectReason.replace(/_/g, ' ')}</div>}
                  </div>
                  <span className={`tag ${p.status}`}>{p.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No reports stored yet. Forged requests never get this far.</p>
          )}
        </div>
      </section>
    </>
  );
}

function Scenario(props: {
  icon: string;
  tone: 'green' | 'violet' | 'blue' | 'red' | 'amber';
  title: string;
  hint: string;
  featured?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`scenario tone-${props.tone}${props.featured ? ' featured' : ''}`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="scenario-icon" aria-hidden>
        {props.icon}
      </span>
      <span className="scenario-title">{props.title}</span>
      <span className="scenario-hint">{props.hint}</span>
      {props.featured && <span className="chip chip-green scenario-flag">Try this first</span>}
    </button>
  );
}

// One raw result → a readable tag.
function describe(r: SimulatedResult): { text: string; tone: Tone } {
  if (r.httpStatus === 401) return { text: '401 forged', tone: 'rejected' };
  if (r.body?.status === 'rejected') return { text: `rejected: ${r.body.reason?.replace(/_/g, ' ')}`, tone: 'rejected' };
  if (r.body?.status === 'credited' || r.body?.status === 'duplicate') {
    return { text: r.body.status, tone: r.body.status };
  }
  return { text: `HTTP ${r.httpStatus}`, tone: 'rejected' };
}

// A batch of raw results → a few tags, e.g. "credited", "duplicate ×19".
function summarise(results: SimulatedResult[]): { text: string; tone: Tone }[] {
  const counts = new Map<string, { text: string; tone: Tone; n: number }>();
  for (const r of results) {
    const tag = describe(r);
    const existing = counts.get(tag.text);
    if (existing) existing.n += 1;
    else counts.set(tag.text, { ...tag, n: 1 });
  }
  return [...counts.values()].map(({ text, tone, n }) => ({ text: n > 1 ? `${text} ×${n}` : text, tone }));
}
