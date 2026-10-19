import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL, type WalletCreditedEvent } from './api';

// Listens for `wallet.credited` for one user. The server puts each connection in a room
// named after the userId it announces here (no auth in this demo; see the README).
// The socket is a convenience for live updates: if it drops, the wallet still shows the
// truth on the next refetch, because the balance always comes from the ledger.
export function useWalletSocket(userId: string, onCredited: (event: WalletCreditedEvent) => void) {
  // Keep the latest callback without reconnecting every render.
  const handler = useRef(onCredited);
  useEffect(() => {
    handler.current = onCredited;
  });

  useEffect(() => {
    // Dev: same origin, Vite proxies /socket.io to the API (see vite.config.ts).
    // Production: connect straight to the API's URL.
    const socket = io(API_URL || undefined, { auth: { userId }, transports: ['websocket'] });
    socket.on('wallet.credited', (event: WalletCreditedEvent) => handler.current(event));
    return () => {
      socket.disconnect();
    };
  }, [userId]);
}
