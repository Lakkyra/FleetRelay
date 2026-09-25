import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import {
  EventType,
  WsMessage,
  TelemetryPing,
  TelemetryBatchPayload,
  OfferResponsePayload,
  DriverIdentifyPayload,
} from '@fleetrelay/contracts';
import { ingestTelemetryPing, ingestTelemetryBatch } from '../telemetry/ingestion';
import { dispatchEngine } from '../dispatch/engine';
import { query } from '../db';

// Active driver sockets: driverId -> WebSocket
const driverSockets = new Map<string, WebSocket>();

// Active dispatcher console sockets
const consoleSockets = new Set<WebSocket>();

export function registerWebSocketGateway(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    const socket = connection.socket;
    let registeredDriverId: string | null = null;
    let isConsole: boolean = false;

    console.log('[WebSocket] Client connected from', req.ip);

    socket.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsMessage<any>;

        switch (msg.event) {
          // 1. Mobile Driver Identification
          case EventType.DRIVER_IDENTIFY: {
            const payload = msg.payload as DriverIdentifyPayload;
            registeredDriverId = payload.driverId;
            driverSockets.set(registeredDriverId, socket);
            console.log(`[WebSocket] Driver identified: ${registeredDriverId}`);

            // Update driver status to idle
            await query(`UPDATE drivers SET status = 'idle', last_heartbeat = NOW() WHERE id = $1`, [
              registeredDriverId,
            ]);

            socket.send(
              JSON.stringify({
                event: EventType.PONG,
                payload: { status: 'authenticated', driverId: registeredDriverId },
                timestamp: new Date().toISOString(),
              })
            );
            break;
          }

          // 2. Dispatcher Console Identification
          case EventType.CONSOLE_IDENTIFY: {
            isConsole = true;
            consoleSockets.add(socket);
            console.log('[WebSocket] Dispatcher Console attached.');
            break;
          }

          // 3. High-Frequency Telemetry Ping from Mobile
          case EventType.TELEMETRY_PING: {
            const ping = msg.payload as TelemetryPing;
            await ingestTelemetryPing(ping);
            break;
          }

          // 4. Batched Telemetry from Mobile
          case EventType.TELEMETRY_BATCH: {
            const batch = msg.payload as TelemetryBatchPayload;
            await ingestTelemetryBatch(batch);
            break;
          }

          // 5. Driver Accepted Job Offer
          case EventType.OFFER_ACCEPTED: {
            const res = msg.payload as OfferResponsePayload;
            await dispatchEngine.handleOfferAccepted(res.jobId, res.driverId);
            break;
          }

          // 6. Driver Declined Job Offer
          case EventType.OFFER_DECLINED: {
            const res = msg.payload as OfferResponsePayload;
            await dispatchEngine.handleOfferDeclined(res.jobId, res.driverId);
            break;
          }

          // 7. Job Status Transition (e.g. arrived at pickup, completed)
          case EventType.JOB_UPDATE: {
            const { jobId, newStatus, currentCoords } = msg.payload;
            await query(`UPDATE jobs SET status = $2, updated_at = NOW() WHERE id = $1`, [
              jobId,
              newStatus,
            ]);

            if (newStatus === 'completed' && registeredDriverId) {
              await query(`UPDATE drivers SET status = 'idle' WHERE id = $1`, [
                registeredDriverId,
              ]);
            }

            broadcastToDispatcher({
              event: EventType.CONSOLE_JOB_EVENT,
              payload: { jobId, newStatus, currentCoords },
              timestamp: new Date().toISOString(),
            });
            break;
          }

          default:
            console.warn('[WebSocket] Unknown event type:', msg.event);
        }
      } catch (err: any) {
        console.error('[WebSocket] Message handling error:', err.message);
      }
    });

    socket.on('close', async () => {
      if (registeredDriverId) {
        driverSockets.delete(registeredDriverId);
        console.log(`[WebSocket] Driver disconnected: ${registeredDriverId}`);
        // Optionally mark driver as offline
        await query(
          `UPDATE drivers SET status = 'offline', updated_at = NOW() WHERE id = $1`,
          [registeredDriverId]
        );
      }
      if (isConsole) {
        consoleSockets.delete(socket);
        console.log('[WebSocket] Dispatcher Console disconnected.');
      }
    });
  });
}

/**
 * Sends a message to a specific connected driver
 */
export function sendToDriver(driverId: string, message: WsMessage<any>): boolean {
  const socket = driverSockets.get(driverId);
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    return true;
  }
  return false;
}

/**
 * Broadcasts a message to all connected dispatcher consoles
 */
export function broadcastToDispatcher(message: WsMessage<any>): void {
  const payload = JSON.stringify(message);
  for (const socket of consoleSockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    }
  }
}
