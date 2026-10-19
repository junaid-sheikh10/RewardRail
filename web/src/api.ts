// All calls to the backend live here, so components never build URLs themselves.
// In dev, /api is proxied to the NestJS API (see vite.config.ts).
// In production, set VITE_API_URL at build time to the API's public URL.

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

// '' means "same origin" (dev proxy). The API has no path prefix of its own.
export const API_URL: string = import.meta.env.VITE_API_URL ?? '';
const API_BASE = API_URL || '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    // Nest answers errors as {statusCode, message, error}: show the message, not the raw JSON.
    const text = await res.text().catch(() => '');
    let detail = text;
    try {
      const body = JSON.parse(text) as { message?: string | string[] };
      if (body.message) detail = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      /* not JSON: keep the raw text */
    }
    throw new Error(detail || `${res.status} on ${path}`);
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

export type ClaimStatus = 'resolved' | 'needs_human';
export type Claim = {
  id: string;
  userId: string;
  offerId: string;
  message: string;
  status: ClaimStatus;
  category: string;
  source: 'rules' | 'llm' | 'fallback';
  confidence: number | null;
  reply: string;
  createdAt: string;
  offer?: { title: string };
  user?: { displayName: string };
};

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  offers: () => request<Offer[]>('/offers'),
  offersForUser: (userId: string) => request<UserOffer[]>(`/users/${userId}/offers`),
  startOffer: (userId: string, offerId: string) => post<{ clickId: string }>('/clicks', { userId, offerId }),
  wallet: (userId: string) => request<Wallet>(`/users/${userId}/wallet`),
  postbacks: (clickId: string) => request<PostbackRow[]>(`/postbacks?clickId=${encodeURIComponent(clickId)}`),

  createClaim: (userId: string, offerId: string, message: string) =>
    post<Claim>('/claims', { userId, offerId, message }),
  claims: (status?: ClaimStatus) => request<Claim[]>(`/claims${status ? `?status=${status}` : ''}`),

  // Demo panel only. The server signs and sends these (the browser never sees the secret).
  simulatePostback: (input: SimulateInput) =>
    post<{ eventId: string; results: SimulatedResult[] }>('/dev/simulate-postback', input),
  resetDemo: (userId: string) => post<{ deleted: Record<string, number> }>('/dev/reset', { userId }),
};

// Money arrives as integer cents; only format it at the very edge, for display.
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
