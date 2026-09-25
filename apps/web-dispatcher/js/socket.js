// WebSocket client for Dispatcher Command Center
class DispatcherSocket {
  constructor(url = 'ws://localhost:4000/ws') {
    this.url = url;
    this.ws = null;
    this.listeners = new Map();
    this.reconnectTimer = null;
  }

  connect() {
    console.log('[DispatcherSocket] Connecting to', this.url);
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[DispatcherSocket] Connected!');
        this.updateConnectionUI(true);

        // Identify as dispatcher console
        this.send('console:identify', { client: 'WebDispatcherConsole' });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.emit(msg.event, msg.payload);
        } catch (err) {
          console.error('[DispatcherSocket] Parse error:', err);
        }
      };

      this.ws.onclose = () => {
        this.updateConnectionUI(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[DispatcherSocket] Error:', err);
        this.updateConnectionUI(false);
      };
    } catch {
      this.updateConnectionUI(false);
      this.scheduleReconnect();
    }
  }

  send(event, payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, payload, timestamp: new Date().toISOString() }));
    }
  }

  on(event, cb) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(cb);
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((cb) => cb(data));
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  updateConnectionUI(connected) {
    const indicator = document.getElementById('ws-indicator');
    const text = document.getElementById('ws-status-text');
    if (!indicator || !text) return;

    if (connected) {
      indicator.className = 'connection-status connected';
      text.textContent = 'Connected ' + this.url;
    } else {
      indicator.className = 'connection-status disconnected';
      text.textContent = 'Disconnected (Retrying...)';
    }
  }
}

window.dispatcherSocket = new DispatcherSocket();
