export class TripUpdatesStore {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.lastFetchTs = null;      // JS timestamp (ms)
    this.header = null;           // Header object
    this.entities = [];           // Raw Entities array
    this.raw = null;              // Full payload
    this.byTripId = new Map();    // TripId -> entity
    this.byRouteId = new Map();   // RouteId -> entity[]
    this._autoTimer = null;
    this._abortCtrl = null;
  }

  async refresh() {
    if (this._abortCtrl) this._abortCtrl.abort();
    this._abortCtrl = new AbortController();
    try {
      const res = await fetch(this.endpoint, {
        signal: this._abortCtrl.signal,
        cache: 'no-cache'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this._ingest(data);
      return data;
    } catch (e) {
      if (e.name !== 'AbortError') console.error('[TripUpdatesStore] refresh failed', e);
      throw e;
    }
  }

  _ingest(data) {
    this.raw = data;
    this.header = data?.Header || null;
    this.entities = Array.isArray(data?.Entities) ? data.Entities : [];
    this.lastFetchTs = Date.now();
    this._reindex();
  }

  _reindex() {
    this.byTripId.clear();
    this.byRouteId.clear();
    for (const ent of this.entities) {
      const trip = ent?.TripUpdate?.Trip;
      if (!trip) continue;
      const tripId = trip.TripId;
      const routeId = trip.RouteId;
      if (tripId) this.byTripId.set(tripId, ent);
      if (routeId) {
        if (!this.byRouteId.has(routeId)) this.byRouteId.set(routeId, []);
        this.byRouteId.get(routeId).push(ent);
      }
    }
  }

  getTrip(tripId) {
    return this.byTripId.get(tripId) || null;
  }

  getTripsByRoute(routeId) {
    return this.byRouteId.get(routeId) || [];
  }

  stopTimeUpdatesForTrip(tripId) {
    return this.getTrip(tripId)?.TripUpdate?.StopTimeUpdates || [];
  }

  averageDepartureDelaySeconds(tripId) {
    const ups = this.stopTimeUpdatesForTrip(tripId);
    const vals = ups
      .map(u => typeof u?.Departure?.Delay === 'number' ? u.Departure.Delay
        : (typeof u?.Arrival?.Delay === 'number' ? u.Arrival.Delay : null))
      .filter(v => v !== null);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  startAutoRefresh(intervalMs = 30000) {
    this.stopAutoRefresh();
    this._autoTimer = setInterval(() => {
      this.refresh().catch(() => {});
    }, intervalMs);
  }

  stopAutoRefresh() {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
    }
  }
}

export const tripUpdatesStore = new TripUpdatesStore(
  'https://its.rideralerts.com/InfoPoint/GTFS-Realtime.ashx?Type=TripUpdate&debug=true'
);

// Optional global
window.tripUpdatesStore = tripUpdatesStore;
tripUpdatesStore.startAutoRefresh(); // (enable if desired)
