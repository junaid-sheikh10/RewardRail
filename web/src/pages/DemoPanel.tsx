import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatCents, type SimulatedResult, type SimulateInput } from '../api';

type Props = { userId: string };

// One line in the live result log.
type LogEntry = { id: number; time: string; action: string; outcome: { text: string; tone: Tone }[] };
type Tone = 'credited' | 'duplicate' | 'rejected';

// The most important screen: it makes the backend's reliability visible.
// The browser never holds POSTBACK_SECRET. Every button asks the dev-only endpoint
// (POST /dev/simulate-postback) to act as the advertiser: the server signs and calls
// our real POST /postbacks over HTTP. That endpoint is switched off in production.
export function DemoPanel({ userId }: Props) {
  const queryClient = useQueryClient();
  const offers = useQuery({ queryKey: ['offers', userId], queryFn: () => api.offersForUser(userId) });
  const wallet = useQuery({ queryKey: ['wallet', userId], queryFn: () => api.wallet(userId) });

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

  const record = (action: string, results: SimulatedResult[]) => {
    setNextId((n) => n + 1);
    setLog((current) =>
      [{ id: nextId, time: new Date().toLocaleTimeString(), action, outcome: summarise(results) }, ...current].slice(0, 30),
    );
  };

  const run = useMutation({
    mutationFn: async (job: { action: string; calls: SimulateInput[] }) => {
      // Sequential between calls (so "out of order" really is in order), parallel inside one call.
      const all: SimulatedResult[] = [];
      for (const call of job.calls) all.push(...(await api.simulatePostback(call)).results);
      return all;
    },
    onSuccess: (results, job) => {
      record(job.action, results);
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

  if (offers.isLoading) return <p className="muted">Loading…</p>;
  if (offers.error) return <p className="error">Couldn't load offers: {(offers.error as Error).message}</p>;

  if (!offer || !milestone) {
    return (
      <section>
        <h1>Advertiser simulator</h1>
        <div className="placeholder">
          <p>
            Start an offer first. <Link to="/">Go to the offer wall →</Link>
          </p>
          <p className="muted">The simulator sends postbacks for an offer that {userId} has started.</p>
        </div>
      </section>
    );
  }

  const clickId = offer.clickId!;
  const claimed = milestone.payoutCents;
  const send = (action: string, ...calls: SimulateInput[]) => run.mutate({ action, calls });
  const base = { clickId, event: milestone.key, payoutCents: claimed };
  const busy = run.isPending || reset.isPending;

  return (
    <section>
      <h1>Advertiser simulator</h1>
      <p className="muted">
        You are the advertiser. Fire postbacks at the real endpoint and watch the money only ever move once.
      </p>

      <div className="panel-top">
        <div className="balance-card compact">
          <span className="muted">{userId}'s balance</span>
          <strong className="balance">{formatCents(wallet.data?.balanceCents ?? 0)}</strong>
        </div>

        <label>
          Offer
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
        <span className="muted click-id">click: {clickId}</span>
      </div>

      <div className="actions">
        <Action
          title="Send valid postback"
          hint="Signed correctly. Pays the milestone, once."
          disabled={busy}
          onClick={() => send(`Valid postback: ${milestone.label}`, base)}
        />
        <Action
          title="Send the same postback 20× at once"
          hint="Same eventId, 20 simultaneous requests. The balance must rise only once."
          disabled={busy}
          onClick={() => send(`Same postback ×20 at once: ${milestone.label}`, { ...base, repeat: 20 })}
        />
        <Action
          title="Send milestones out of order"
          hint="Last milestone first, then back to the first. Each pays once, independently."
          disabled={busy}
          onClick={() =>
            send(
              'Out of order: ' + [...offer.milestones].reverse().map((m) => m.key).join(' → '),
              ...[...offer.milestones].reverse().map((m) => ({ clickId, event: m.key, payoutCents: m.payoutCents })),
            )
          }
        />
        <Action
          title="Send with a bad signature"
          hint="A forged request. The server answers 401 and stores nothing."
          disabled={busy}
          onClick={() => send('Bad signature', { ...base, validSignature: false })}
        />
        <Action
          title="Send for an unknown click"
          hint="Valid signature, but no such click. Rejected and recorded, never credited."
          disabled={busy}
          onClick={() => send('Unknown click', { ...base, clickId: 'clk_does_not_exist' })}
        />
        <Action
          title="Claim an inflated payout"
          hint="Body says $999.99. We pay our own milestone amount instead."
          disabled={busy}
          onClick={() => send(`Inflated payout claim: ${milestone.label}`, { ...base, payoutCents: 99_999 })}
        />
      </div>

      <div className="reset">
        <button className="secondary" disabled={busy} onClick={() => reset.mutate()}>
          Reset demo for {userId}
        </button>
        <span className="muted">Deletes this user's clicks, postbacks and earnings so you can run it again (demo only).</span>
      </div>
      {(run.error || reset.error) && <p className="error">{((run.error ?? reset.error) as Error).message}</p>}

      <div className="two-col">
        <div>
          <h2>What you just sent</h2>
          {log.length === 0 ? (
            <p className="muted">Nothing yet. Press a button above.</p>
          ) : (
            <ul className="log">
              {log.map((entry) => (
                <li key={entry.id}>
                  <div className="log-head">
                    <strong>{entry.action}</strong>
                    <span className="muted">{entry.time}</span>
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

        <div>
          <h2>What the server stored</h2>
          <p className="muted">GET /postbacks for this click. Forged (bad-signature) requests never get this far.</p>
          {serverLog.data?.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {serverLog.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.eventKey}
                      <div className="muted small">{p.eventId.slice(0, 12)}…</div>
                    </td>
                    <td>
                      <span className={`tag ${p.status}`}>{p.status}</span>
                    </td>
                    <td className="muted">{p.rejectReason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No postbacks stored for this click yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Action(props: { title: string; hint: string; disabled: boolean; onClick: () => void }) {
  return (
    <div className="action">
      <button disabled={props.disabled} onClick={props.onClick}>
        {props.title}
      </button>
      <p className="muted small">{props.hint}</p>
    </div>
  );
}

// Turn a batch of raw results into a few readable tags, e.g. "credited ×1", "duplicate ×19".
function summarise(results: SimulatedResult[]): { text: string; tone: Tone }[] {
  const counts = new Map<string, { text: string; tone: Tone; n: number }>();
  for (const r of results) {
    let text: string;
    let tone: Tone;
    if (r.httpStatus === 401) {
      text = '401 bad signature';
      tone = 'rejected';
    } else if (r.body?.status === 'rejected') {
      text = `rejected: ${r.body.reason}`;
      tone = 'rejected';
    } else if (r.body?.status === 'credited' || r.body?.status === 'duplicate') {
      text = r.body.status;
      tone = r.body.status;
    } else {
      text = `HTTP ${r.httpStatus}`;
      tone = 'rejected';
    }
    const existing = counts.get(text);
    if (existing) existing.n += 1;
    else counts.set(text, { text, tone, n: 1 });
  }
  return [...counts.values()].map(({ text, tone, n }) => ({ text: n > 1 ? `${text} ×${n}` : text, tone }));
}
