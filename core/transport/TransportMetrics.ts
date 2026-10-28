/**
 * NINE Transport — Transport Metrics
 *
 * Tracks per-transport statistics for monitoring and benchmarking.
 */

export interface TransportMetricsSnapshot {
  bytesSent: number;
  bytesReceived: number;
  packetsSent: number;
  packetsReceived: number;
  sendFailures: number;
  connectionsEstablished: number;
  connectionsLost: number;
  peersDiscovered: number;
  totalSendLatencyMs: number;
  averageSendLatencyMs: number;
}

export class TransportMetrics {
  private _bytesSent = 0;
  private _bytesReceived = 0;
  private _packetsSent = 0;
  private _packetsReceived = 0;
  private _sendFailures = 0;
  private _connectionsEstablished = 0;
  private _connectionsLost = 0;
  private _peersDiscovered = 0;
  private _totalSendLatencyMs = 0;

  recordSend(bytes: number, latencyMs: number = 0): void {
    this._bytesSent += bytes;
    this._packetsSent += 1;
    this._totalSendLatencyMs += latencyMs;
  }

  recordReceive(bytes: number): void {
    this._bytesReceived += bytes;
    this._packetsReceived += 1;
  }

  recordSendFailure(): void { this._sendFailures += 1; }
  recordConnectionEstablished(): void { this._connectionsEstablished += 1; }
  recordConnectionLost(): void { this._connectionsLost += 1; }
  recordPeerDiscovered(): void { this._peersDiscovered += 1; }

  snapshot(): TransportMetricsSnapshot {
    return {
      bytesSent: this._bytesSent,
      bytesReceived: this._bytesReceived,
      packetsSent: this._packetsSent,
      packetsReceived: this._packetsReceived,
      sendFailures: this._sendFailures,
      connectionsEstablished: this._connectionsEstablished,
      connectionsLost: this._connectionsLost,
      peersDiscovered: this._peersDiscovered,
      totalSendLatencyMs: this._totalSendLatencyMs,
      averageSendLatencyMs: this._packetsSent > 0 ? this._totalSendLatencyMs / this._packetsSent : 0,
    };
  }

  reset(): void {
    this._bytesSent = 0; this._bytesReceived = 0;
    this._packetsSent = 0; this._packetsReceived = 0;
    this._sendFailures = 0; this._connectionsEstablished = 0;
    this._connectionsLost = 0; this._peersDiscovered = 0;
    this._totalSendLatencyMs = 0;
  }
}
