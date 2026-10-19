export type Toast = { id: number; amount: string; text: string };

// aria-live so screen readers announce a new credit without stealing focus.
export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-coin" aria-hidden>
            $
          </span>
          <div>
            <strong>You earned {t.amount}</strong>
            <div className="toast-sub">{t.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
