import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api, DEMO_USERS, formatCents, type WalletCreditedEvent } from './api';
import { Logo } from './components/Logo';
import { useCountUp } from './components/useCountUp';
import { DemoPanel } from './pages/DemoPanel';
import { OfferWall } from './pages/OfferWall';
import { SupportQueue } from './pages/SupportQueue';
import { Wallet } from './pages/Wallet';
import { Toasts, type Toast } from './Toasts';
import { useWalletSocket } from './useWalletSocket';

const NAV = [
  { to: '/', label: 'Earn', icon: '🎮', end: true },
  { to: '/wallet', label: 'Wallet', icon: '💰' },
  { to: '/demo', label: 'Advertiser console', short: 'Console', icon: '🛰️' },
  { to: '/support', label: 'Support', icon: '🛟' },
];

export function App() {
  const [userId, setUserId] = useState<string>(DEMO_USERS[0].id);
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(0);

  // Mounted here (not on the Wallet page) so the toast shows wherever the user is.
  const onCredited = useCallback(
    (event: WalletCreditedEvent) => {
      const id = nextToastId.current++;
      setToasts((current) => [
        ...current,
        { id, amount: formatCents(event.amountCents), text: `${event.offerTitle} · ${event.milestoneLabel}` },
      ]);
      setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 6000);
      // The event only says "something changed"; the data itself is refetched from the API.
      void queryClient.invalidateQueries({ queryKey: ['wallet', event.userId] });
      void queryClient.invalidateQueries({ queryKey: ['offers', event.userId] });
      void queryClient.invalidateQueries({ queryKey: ['postbacks'] });
    },
    [queryClient],
  );
  useWalletSocket(userId, onCredited);

  const user = DEMO_USERS.find((u) => u.id === userId)!;

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="RewardRail home">
          <Logo />
        </NavLink>

        <Nav className="nav" />

        <div className="topbar-right">
          <BalancePill userId={userId} />
          <label className="user-switch">
            <span className="avatar" aria-hidden>
              {user.name[0]}
            </span>
            <span className="visually-hidden">Demo user</span>
            <select value={userId} onChange={(e) => setUserId(e.target.value)}>
              {DEMO_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<OfferWall userId={userId} />} />
          <Route path="/wallet" element={<Wallet userId={userId} />} />
          <Route path="/demo" element={<DemoPanel userId={userId} />} />
          <Route path="/support" element={<SupportQueue />} />
        </Routes>
      </main>

      <footer className="footer">
        <span>
          RewardRail is a working demo of a rewarded-offers platform: exactly-once payouts from signed advertiser
          postbacks.
        </span>
        <a href="https://github.com/junaid-sheikh10/RewardRail" target="_blank" rel="noreferrer">
          Source on GitHub →
        </a>
      </footer>

      {/* Phones get a bottom tab bar. It lives outside the header on purpose: the header's
          backdrop-filter would otherwise pin a "fixed" child to the header, not the screen. */}
      <Nav className="tabbar" />

      <Toasts toasts={toasts} />
    </div>
  );
}

// Rendered twice (top bar on desktop, tab bar on phones); CSS shows exactly one.
function Nav({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Main">
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end}>
          <span className="nav-icon" aria-hidden>
            {item.icon}
          </span>
          <span className="nav-label">{item.label}</span>
          <span className="nav-short">{item.short ?? item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function BalancePill({ userId }: { userId: string }) {
  const wallet = useQuery({ queryKey: ['wallet', userId], queryFn: () => api.wallet(userId) });
  const shown = useCountUp(wallet.data?.balanceCents);
  return (
    <NavLink to="/wallet" className="balance-pill" aria-label={`Balance ${formatCents(shown)}`}>
      <span className="coin" aria-hidden>
        $
      </span>
      {formatCents(shown)}
    </NavLink>
  );
}
