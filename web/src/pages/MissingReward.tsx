import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Claim } from '../api';

const MAX = 1000;

const SOURCE_LABEL: Record<Claim['source'], string> = {
  rules: 'Answered automatically from your account records',
  llm: 'Answered by an AI assistant from your account records',
  fallback: 'Passed to a support agent',
};

// "I reached level 10 but wasn't paid." The answer never changes your balance: only the
// advertiser's signed report can credit you, so a claim can explain or escalate, not pay.
export function MissingReward({ userId }: { userId: string }) {
  const offers = useQuery({ queryKey: ['offers-all'], queryFn: api.offers });
  const [offerId, setOfferId] = useState('');
  const [message, setMessage] = useState('');

  const submit = useMutation({
    mutationFn: () => api.createClaim(userId, offerId || offers.data![0].id, message),
  });

  if (!offers.data?.length) return null;
  const result = submit.data;

  return (
    <section className="claim">
      <h2>Missing reward?</h2>
      <p className="muted">
        Tell us what happened. We check your records first; if they don't settle it, a person will look.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <label>
          Offer
          <select value={offerId || offers.data[0].id} onChange={(e) => setOfferId(e.target.value)}>
            {offers.data.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          What happened?
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MAX}
            rows={3}
            placeholder="I reached level 10 but my wallet didn't change."
            required
          />
        </label>
        <div className="claim-actions">
          <button disabled={submit.isPending || !message.trim()}>
            {submit.isPending ? 'Checking…' : 'Send claim'}
          </button>
          <span className="muted small">
            {message.length}/{MAX}
          </span>
        </div>
      </form>

      {submit.error && <p className="error">{(submit.error as Error).message}</p>}

      {result && (
        <div className={`claim-result ${result.status}`} role="status">
          <div className="log-head">
            <strong>{result.status === 'resolved' ? 'Here is what we found' : 'We are looking into it'}</strong>
            <span className={`tag ${result.status}`}>{result.status === 'resolved' ? 'answered' : 'in review'}</span>
          </div>
          <p>{result.reply}</p>
          <p className="muted small">{SOURCE_LABEL[result.source]}. This does not change your balance.</p>
        </div>
      )}
    </section>
  );
}
