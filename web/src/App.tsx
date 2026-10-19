import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { DEMO_USERS, formatCents, type WalletCreditedEvent } from './api';
import { DemoPanel } from './pages/DemoPanel';
import { OfferWall } from './pages/OfferWall';
import { SupportQueue } from './pages/SupportQueue';
import { Wallet } from './pages/Wallet';
import { Toasts, type Toast } from './Toasts';
import { useWalletSocket } from './useWalletSocket';

export function App() {
  const [userId, setUserId] = useState<string>(DEMO_USERS[0].id);
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(0);

  // Mounted here (not on the Wallet page) so the toast shows wherever the user is.
  const onCredited = useCallback(
    (event: WalletCreditedEvent) => {
      const id = nextToastId.current++;
      const text = `You earned ${formatCents(event.amountCents)}: ${event.offerTitle}, ${event.milestoneLabel}`;
      setToasts((current) => [...current, { id, text }]);
      setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 6000);
      // The event only says "something changed"; the data itself is refetched from the API.
      void queryClient.invalidateQueries({ queryKey: ['wallet', event.userId] });
      void queryClient.invalidateQueries({ queryKey: ['offers', event.userId] });
      void queryClient.invalidateQueries({ queryKey: ['postbacks'] });
    },
    [queryClient],
  );
  useWalletSocket(userId, onCredited);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">RewardRail</span>
        <nav>
          <NavLink to="/" end>
            Offers
          </NavLink>
          <NavLink to="/wallet">Wallet</NavLink>
          <NavLink to="/demo">Advertiser simulator</NavLink>
          <NavLink to="/support">Support queue</NavLink>
        </nav>
        <label className="user-switch">
          User
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            {DEMO_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<OfferWall userId={userId} />} />
          <Route path="/wallet" element={<Wallet userId={userId} />} />
          <Route path="/demo" element={<DemoPanel userId={userId} />} />
          <Route path="/support" element={<SupportQueue />} />
        </Routes>
      </main>

      <Toasts toasts={toasts} />
    </div>
  );
}
