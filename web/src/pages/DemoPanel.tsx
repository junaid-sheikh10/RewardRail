type Props = { userId: string };

// The most important screen: it makes the backend's reliability visible.
// TODO (Phase 4): for one of this user's started offers (needs a clickId):
// - "Send postback" for a chosen milestone
// - "Send the same postback 20× at once" → balance must go up only once
// - "Send milestones out of order"
// - "Send with a bad signature" → rejected with 401
// - live log of every result: credited / duplicate / rejected + reason (GET /postbacks?clickId=)
//
// Signing: the browser must NOT know POSTBACK_SECRET. Add a dev-only API endpoint
// (e.g. POST /dev/simulate-postback, disabled when NODE_ENV=production) that signs
// and forwards the postback. Document this tradeoff in the README.
export function DemoPanel({ userId }: Props) {
  return (
    <section>
      <h1>Advertiser simulator</h1>
      <div className="placeholder">
        <p>
          Fire postbacks for <code>{userId}</code>'s started offers and watch duplicates and fakes get
          rejected.
        </p>
        <p className="muted">Phase 4 · needs POST /clicks, POST /postbacks and a dev-only signing endpoint</p>
      </div>
    </section>
  );
}
