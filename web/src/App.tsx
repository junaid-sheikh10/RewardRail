import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { DEMO_USERS } from './api';
import { DemoPanel } from './pages/DemoPanel';
import { OfferWall } from './pages/OfferWall';
import { Wallet } from './pages/Wallet';

export function App() {
  const [userId, setUserId] = useState<string>(DEMO_USERS[0].id);

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
        </Routes>
      </main>
    </div>
  );
}
