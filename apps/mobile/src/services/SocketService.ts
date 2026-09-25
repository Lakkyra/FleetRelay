import {
  EventType,
  WsMessage,
  TelemetryPing,
  DispatchOffer,
  OfferResponsePayload,
} from '@fleetrelay/contracts';
import { offlineQueue } from './OfflineQueue';

type MessageListener = (data: any) => void;

export class SocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private driverId: string | null = null;
  private listeners: Map<EventType, Set<MessageListener>> = new Map();
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(serverUrl: string = 'ws://10.0.2.2:4000/ws') {
    // 10.0.2.2 is Android Emulator localhost equivalent
    this.url = serverUrl;
  }

  public setServerUrl(url: string) {
    this.url = url;
  }

  public connect(driverId: string): void {
    this.driverId = driverId;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    console.log(`[SocketService] Connecting to ${this.url} for driver ${driverId}...`);

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[SocketService] Connected to FleetRelay server!');
        this.isConnecting = false;
        this.reconnectAttempts = 0;

        // Identify driver to server
        this.send(EventType.DRIVER_IDENTIFY, {
          driverId: this.driverId,
          appVersion: '1.0.0',
        });

        // Flush queued offline telemetry batches
        this.flushOfflineBuffer();

        // Start heartbeat ping
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data.toString()) as WsMessage<any>;
          this.emit(msg.event, msg.payload);
        } catch (err) {
          console.error('[SocketService] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        console.warn('[SocketService] Disconnected from FleetRelay.');
        this.cleanup();
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[SocketService] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[SocketService] Connection creation failed:', err);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.cleanup();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.driverId = null;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public send(event: EventType, payload: any): void {
    if (this.isConnected()) {
      const msg: WsMessage<any> = {
        event,
        payload,
        timestamp: new Date().toISOString(),
      };
      this.ws!.send(JSON.stringify(msg));
    }
  }

  /**
   * Transmits a telemetry coordinate ping; enqueues into offline buffer if connection is lost
   */
  public streamTelemetryPing(ping: TelemetryPing): void {
    if (this.isConnected()) {
      this.send(EventType.TELEMETRY_PING, ping);
    } else {
      offlineQueue.enqueue(ping);
    }
  }

  /**
   * Flushes coordinates buffered during network outages as a single batch
   */
  private flushOfflineBuffer(): void {
    const queueSize = offlineQueue.size();
    if (queueSize === 0) return;

    console.log(`[SocketService] Flushing ${queueSize} buffered telemetry pings...`);
    while (offlineQueue.size() > 0) {
      const batchPings = offlineQueue.drain(50);
      if (batchPings.length > 0) {
        this.send(EventType.TELEMETRY_BATCH, {
          driverId: this.driverId,
          pings: batchPings,
          sentAt: new Date().toISOString(),
        });
      }
    }
  }

  public respondToOffer(offerId: string, jobId: string, accepted: boolean): void {
    const event = accepted ? EventType.OFFER_ACCEPTED : EventType.OFFER_DECLINED;
    const payload: OfferResponsePayload = {
      offerId,
      jobId,
      driverId: this.driverId!,
      accepted,
    };
    this.send(event, payload);
  }

  public on<T = any>(event: EventType, callback: (data: T) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: EventType, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[SocketService] Error in listener for ${event}:`, err);
        }
      });
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;
    // Exponential backoff with 1s to 15s max clamp and jitter
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 500, 15000);
    console.log(`[SocketService] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.driverId) {
        this.connect(this.driverId);
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.send(EventType.DRIVER_STATUS_CHANGE, {
          driverId: this.driverId,
          heartbeat: true,
        });
      }
    }, 25000);
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

export const socketService = new SocketService();
