/**
 * VehiclePositionsStore
 * Fetches & indexes GTFS-RT VehiclePosition feed.
 *
 * Endpoint returns JSON like:
 * {
 *   Header:{...},
 *   Entities:[ { Id, Vehicle:{ Trip:{TripId,RouteId}, Vehicle:{Id,Label}, Position:{Latitude,Longitude,Bearing,Speed}, StopId, CurrentStatus, Timestamp } }, ... ]
 * }
 */
export class VehiclePositionsStore {
  constructor(endpoint = 'https://its.rideralerts.com/InfoPoint/GTFS-Realtime.ashx?Type=VehiclePosition&debug=true') {
    this.endpoint = endpoint;
    this.lastFetch = 0;
    this.minIntervalMs = 5000;
    this.entities = [];
  }

  async refresh(force = false) {
    const now = Date.now();
    if (!force && now - this.lastFetch < this.minIntervalMs && this.entities.length) return;
    const resp = await fetch(this.endpoint, { cache: 'no-store' });
    if (!resp.ok) throw new Error('Vehicle positions HTTP ' + resp.status);
    const json = await resp.json();
    this.entities = Array.isArray(json?.Entities) ? json.Entities : [];
    this.lastFetch = now;
  }

  getVehiclesForRoute(routeId) {
    if (!routeId) return [];
    return this.entities
      .map(e => e.Vehicle)
      .filter(v => v && v.Trip && String(v.Trip.RouteId) === String(routeId) && v.Position)
      .map(v => {
        const tripId = v.Trip?.TripId;
        const baseTripId = tripId ? tripId.split('-')[0] : null;
        return {
          id: v.Vehicle?.Id,
          label: v.Vehicle?.Label || v.Vehicle?.Id,
          route_id: String(v.Trip?.RouteId),
          trip_id: tripId,
          base_trip_id: baseTripId,
          lat: v.Position.Latitude,
          lon: v.Position.Longitude,
          bearing: v.Position.Bearing,
          speed: v.Position.Speed,
          timestamp: v.Timestamp
        };
      });
  }
}

export const vehiclePositionsStore = new VehiclePositionsStore();
window.vehiclePositionsStore = vehiclePositionsStore;