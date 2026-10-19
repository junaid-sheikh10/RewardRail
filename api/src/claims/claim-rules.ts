// Step 2 of claim triage: answer WITHOUT an AI wherever the facts are clear.
//
// A pure function (facts in, answer out): no database, no network, so it is trivial to
// test and to explain. Anything it cannot decide returns null and goes to the model.
// Rules come first because they are free, instant, and cannot hallucinate.

export interface ClaimFacts {
  offer: { title: string; milestones: { id: string; key: string; label: string }[] };
  // The user's clicks for this offer.
  clickCount: number;
  // Postbacks recorded for those clicks.
  postbacks: { eventKey: string; status: 'credited' | 'duplicate' | 'rejected'; rejectReason: string | null }[];
  // What the ledger already paid this user for this offer.
  ledger: { milestoneId: string | null; milestoneLabel: string | null; amountCents: number; createdAt: Date }[];
}

export type RuleCategory = 'already_credited' | 'not_started' | 'postback_rejected';
export interface RuleAnswer {
  category: RuleCategory;
  reply: string;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (d: Date) => d.toISOString().slice(0, 10);

export function applyRules(facts: ClaimFacts): RuleAnswer | null {
  const { offer, clickCount, postbacks, ledger } = facts;

  // 1. Never started: there is nothing for the advertiser to have reported against.
  if (clickCount === 0) {
    return {
      category: 'not_started',
      reply: `You haven't started "${offer.title}" yet, so we have nothing to track. Press "Start offer" first, then play, and rewards are credited automatically.`,
    };
  }

  // 2. Everything is already paid: answer with the ledger lines themselves.
  const paidMilestones = new Set(ledger.map((e) => e.milestoneId));
  if (offer.milestones.length > 0 && offer.milestones.every((m) => paidMilestones.has(m.id))) {
    const lines = ledger.map((e) => `${e.milestoneLabel ?? 'Reward'}: ${dollars(e.amountCents)} on ${day(e.createdAt)}`);
    return {
      category: 'already_credited',
      reply: `Good news: every milestone of "${offer.title}" has already been paid to your wallet. ${lines.join('; ')}.`,
    };
  }

  // 3. The advertiser DID report something, but we rejected it. A rejected row that still
  //    says "rejected" has not been fixed by a later retry, so it explains the gap.
  const rejected = postbacks.filter((p) => p.status === 'rejected');
  if (rejected.length > 0) {
    const reasons = rejected.map((p) => explainRejection(p.eventKey, p.rejectReason));
    return {
      category: 'postback_rejected',
      reply: `The advertiser did report progress, but we couldn't credit it yet. ${reasons.join(' ')}`,
    };
  }

  return null; // not clear-cut: let the model (or a person) look
}

function explainRejection(eventKey: string, reason: string | null): string {
  switch (reason) {
    case 'unknown_click':
      return `The "${eventKey}" report reached us before we had recorded your start. It is credited automatically when the advertiser re-sends it.`;
    case 'unknown_milestone':
      return `The advertiser reported "${eventKey}", which isn't a reward this offer pays for.`;
    case 'timestamp_in_future':
      return `The "${eventKey}" report carried a timestamp in the future, so we held it. It is credited when the advertiser re-sends it.`;
    default:
      return `The "${eventKey}" report was rejected (${reason ?? 'no reason recorded'}).`;
  }
}
