// All calls to the backend live here, so components never build URLs themselves.
// In dev, /api is proxied to the NestJS API (see vite.config.ts).

export type Milestone = {
  id: string;
  key: string;
  label: string;
  payoutCents: number;
  sortOrder: number;
};

export type Offer = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  milestones: Milestone[];
};

// Fixed ids from api/prisma/seed.ts. No real auth in this project: a user switcher is enough.
export const DEMO_USERS = [
  { id: 'user_alice', name: 'Alice' },
  { id: 'user_bob', name: 'Bob' },
] as const;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} on ${path}${text ? `: ${text}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export type UserMilestone = Milestone & { credited: boolean };

// GET /users/:id/offers: an offer plus this user's progress.
export type UserOffer = Omit<Offer, 'milestones'> & {
  started: boolean;
  clickId: string | null;
  milestones: UserMilestone[];
};

export type WalletEntry = {
  id: string;
  amountCents: number;
  type: string;
  offerTitle: string | null;
  milestoneLabel: string | null;
  createdAt: string;
};

export type Wallet = { balanceCents: number; entries: WalletEntry[] };

export type PostbackRow = {
  id: string;
  eventId: string;
  clickId: string;
  eventKey: string;
  payoutCents: number;
  status: 'credited' | 'duplicate' | 'rejected';
  rejectReason: string | null;
  receivedAt: string;
};

// What the dev-only simulator returns: one entry per request it fired.
export type SimulatedResult = { httpStatus: number; body: { status?: string; reason?: string; message?: string } | null };
export type SimulateInput = {
  clickId: string;
  event: string;
  payoutCents?: number;
  validSignature?: boolean;
  repeat?: number;
  eventId?: string;
};

// Pushed over Socket.IO when a credit is committed.
export type WalletCreditedEvent = {
  userId: string;
  amountCents: number;
  offerTitle: string;
  milestoneLabel: string;
};

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  offers: () => request<Offer[]>('/offers'),
  offersForUser: (userId: string) => request<UserOffer[]>(`/users/${userId}/offers`),
  startOffer: (userId: string, offerId: string) => post<{ clickId: string }>('/clicks', { userId, offerId }),
  wallet: (userId: string) => request<Wallet>(`/users/${userId}/wallet`),
  postbacks: (clickId: string) => request<PostbackRow[]>(`/postbacks?clickId=${encodeURIComponent(clickId)}`),

  // Demo panel only. The server signs and sends these (the browser never sees the secret).
  simulatePostback: (input: SimulateInput) =>
    post<{ eventId: string; results: SimulatedResult[] }>('/dev/simulate-postback', input),
  resetDemo: (userId: string) => post<{ deleted: Record<string, number> }>('/dev/reset', { userId }),
};

// Money arrives as integer cents; only format it at the very edge, for display.
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
