import { applyRules, ClaimFacts } from '../src/claims/claim-rules';

// Pure unit tests: the rules take facts and return an answer, nothing else.
describe('claim rules', () => {
  const offer = {
    title: 'Dragon',
    milestones: [
      { id: 'm5', key: 'level_5', label: 'Reach level 5' },
      { id: 'm10', key: 'level_10', label: 'Reach level 10' },
    ],
  };
  const facts = (overrides: Partial<ClaimFacts> = {}): ClaimFacts => ({
    offer,
    clickCount: 1,
    postbacks: [],
    ledger: [],
    ...overrides,
  });
  const paid = (id: string, label: string, amountCents: number) => ({
    milestoneId: id,
    milestoneLabel: label,
    amountCents,
    createdAt: new Date('2026-03-04T10:00:00Z'),
  });

  it('no click → not_started', () => {
    const answer = applyRules(facts({ clickCount: 0 }));
    expect(answer?.category).toBe('not_started');
    expect(answer?.reply).toContain('Start offer');
  });

  it('every milestone paid → already_credited, quoting the ledger lines', () => {
    const answer = applyRules(
      facts({ ledger: [paid('m5', 'Reach level 5', 100), paid('m10', 'Reach level 10', 250)] }),
    );
    expect(answer?.category).toBe('already_credited');
    expect(answer?.reply).toContain('Reach level 10: $2.50 on 2026-03-04');
    expect(answer?.reply).toContain('Reach level 5: $1.00');
  });

  it('only SOME milestones paid and nothing rejected → undecided (null), not "already credited"', () => {
    expect(applyRules(facts({ ledger: [paid('m5', 'Reach level 5', 100)] }))).toBeNull();
  });

  it('a rejected postback → postback_rejected with the reason explained', () => {
    const answer = applyRules(
      facts({ postbacks: [{ eventKey: 'level_999', status: 'rejected', rejectReason: 'unknown_milestone' }] }),
    );
    expect(answer?.category).toBe('postback_rejected');
    expect(answer?.reply).toContain('level_999');
    expect(answer?.reply).toContain("isn't a reward");
  });

  it('explains an event that arrived before the click', () => {
    const answer = applyRules(
      facts({ postbacks: [{ eventKey: 'level_10', status: 'rejected', rejectReason: 'unknown_click' }] }),
    );
    expect(answer?.reply).toContain('before we had recorded your start');
  });

  it('credited and duplicate postbacks alone do not trigger the rejected rule', () => {
    expect(
      applyRules(
        facts({
          postbacks: [
            { eventKey: 'level_5', status: 'credited', rejectReason: null },
            { eventKey: 'level_5', status: 'duplicate', rejectReason: 'milestone_already_paid' },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('"not started" wins over everything else', () => {
    const answer = applyRules(
      facts({ clickCount: 0, ledger: [paid('m5', 'Reach level 5', 100), paid('m10', 'Reach level 10', 250)] }),
    );
    expect(answer?.category).toBe('not_started');
  });

  it('an offer with no milestones is never "already credited" by an empty-list technicality', () => {
    expect(applyRules(facts({ offer: { title: 'Empty', milestones: [] } }))).toBeNull();
  });
});
