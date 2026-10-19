import { useQuery } from '@tanstack/react-query';
import { api, formatCents } from '../api';
import { MissingReward } from './MissingReward';

type Props = { userId: string };

export function Wallet({ userId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['wallet', userId],
    queryFn: () => api.wallet(userId),
  });

  if (isLoading) return <p className="muted">Loading wallet…</p>;
  if (error) return <p className="error">Couldn't load the wallet: {(error as Error).message}</p>;
  if (!data) return null;

  return (
    <section>
      <h1>Wallet</h1>
      <div className="balance-card">
        <span className="muted">Balance</span>
        <strong className="balance">{formatCents(data.balanceCents)}</strong>
        <span className="muted">Always the sum of the entries below. There is no stored balance.</span>
      </div>

      <h2>History</h2>
      {data.entries.length === 0 ? (
        <p className="muted">No earnings yet. Start an offer, then use the Advertiser simulator.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>What</th>
              <th>When</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.offerTitle ?? e.type}
                  {e.milestoneLabel && <span className="muted"> · {e.milestoneLabel}</span>}
                </td>
                <td className="muted">{new Date(e.createdAt).toLocaleString()}</td>
                <td className="num">{e.amountCents < 0 ? '-' : '+'}{formatCents(Math.abs(e.amountCents))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <MissingReward userId={userId} />
    </section>
  );
}
