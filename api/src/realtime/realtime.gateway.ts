import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export interface WalletCreditedEvent {
  userId: string;
  amountCents: number;
  offerTitle: string;
  milestoneLabel: string;
}

export const userRoom = (userId: string) => `user:${userId}`;

// Pushes "you just earned money" to the right user's screen.
//
// Each connected browser joins ONE room, named after its user, so an event for Alice
// reaches only Alice's tabs. No auth in this demo: the client says who it is in the
// handshake (`io({ auth: { userId } })`). In a real system the server would verify a
// token and take the user from it, otherwise anyone could listen to anyone's wallet.
//
// This is a best-effort notification, never the source of truth. The wallet always
// reads from the database, so a missed event costs a toast, not money.
@WebSocketGateway({
  cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173' },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server: Server;

  handleConnection(client: Socket) {
    const userId = client.handshake.auth?.userId;
    if (typeof userId !== 'string' || userId.length === 0) {
      this.logger.warn(`Socket ${client.id} connected without a userId; closing it`);
      client.disconnect(true);
      return;
    }
    void client.join(userRoom(userId));
  }

  emitCredited(event: WalletCreditedEvent) {
    this.server.to(userRoom(event.userId)).emit('wallet.credited', event);
  }
}
