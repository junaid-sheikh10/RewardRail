type Props = { userId: string };

// TODO (Phase 4): GET /users/:id/wallet
// - big balance number (formatCents)
// - transaction list: amount, offer title, milestone label, time
// TODO (Phase 3/4): listen for `wallet.credited` over Socket.IO, show a toast
//   "You earned $2.50 — Dragon Quest Saga, Reach level 10" and refetch the wallet.
// TODO (Phase 6): "Missing reward?" form → POST /claims
export function Wallet({ userId }: Props) {
  return (
    <section>
      <h1>Wallet</h1>
      <div className="placeholder">
        <p>
          Balance and transaction history for <code>{userId}</code> will appear here.
        </p>
        <p className="muted">Phase 4 · backed by GET /users/:id/wallet</p>
      </div>
    </section>
  );
}
