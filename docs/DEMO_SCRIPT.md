# RewardRail: demo video script (about 100 seconds)

**Goal of the video:** in under two minutes, show that the system never pays twice, then show how
the AI is fenced in. Keep your voice calm; let the screen do the proving.

## Before you record
- Run the app (or open the deployed one). Pick **Alice**.
- On the Advertiser simulator press **Reset demo for user_alice** so everything starts clean.
- Open the **Wallet** in a second browser window beside the first, so the toast is visible.
- Hide notifications; use a 1280-wide window so the text is readable.

## Script

**0:00 – 0:12 · The problem** *(Offers page)*
> "Studios pay Freecash-style apps to find players. When a user hits a milestone, the studio's
> tracking service sends a postback, and we credit the user. The hard part: postbacks get retried,
> arrive twice, out of order, late, or forged. The one rule is: never pay twice."

**0:12 – 0:25 · Start an offer** *(click Start offer on Dragon Quest Saga)*
> "A user starts an offer. That creates a click with an unguessable id; the advertiser sends it back
> in every postback."

**0:25 – 0:50 · The money shot** *(Advertiser simulator → "Send the same postback 20× at once")*
> "Now I'm the advertiser. Same event, twenty requests at the same instant." *(press; point at the
> log)* "One credited, nineteen duplicates. The balance moved once." *(point at the toast in the
> second window)* "The wallet got a live notification over Socket.IO."
> "This isn't an if-statement: the database refuses the second payment with a unique constraint, even
> when requests race."

**0:50 – 1:10 · Attacks** *(press each, one sentence each)*
> "A forged request with a bad signature: 401, and nothing is stored." *(bad signature)*
> "An unknown click: rejected, kept for inspection, never credited." *(unknown click)*
> "The advertiser claims $999.99: we pay our own milestone amount." *(inflated payout)*
> "Milestones out of order: each pays once, independently." *(out of order; point at the per-milestone tags)*

**1:10 – 1:30 · Missing reward + the AI** *(Wallet → Missing reward? → send a claim; then Support queue)*
> "If a user says they weren't paid, code gathers the facts and plain rules answer first. Only unclear
> cases reach a model. Its output is validated, low confidence goes to a human, and the AI has no
> path to the ledger. It can explain, never pay."

**1:30 – 1:40 · Close**
> "Every safety claim has a test: over a hundred, against real Postgres, including fifty concurrent
> requests. I checked the key ones by breaking the code on purpose. Known limit: users aren't
> authenticated in this demo; the README says what I'd do next."

## If something goes wrong while recording
- Balance already moved? Press **Reset demo** and start the step again.
- Toast didn't show? It's best-effort by design: refresh the Wallet and the balance is correct. (A good
  thing to say out loud if it happens.)
- No API key set? The claim goes to the **Support queue** instead of an AI answer. That *is* the
  graceful-degradation story; show it.
