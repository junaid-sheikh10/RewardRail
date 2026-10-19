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

export const api = {
  offers: () => request<Offer[]>('/offers'),
  // TODO (Phase 4): offersForUser, startOffer (POST /clicks), wallet, postbacks log,
  // and the demo panel's "simulate advertiser" calls.
};

// Money arrives as integer cents; only format it at the very edge, for display.
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
