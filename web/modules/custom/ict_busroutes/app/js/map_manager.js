class MapManager {
    constructor(mapElementId) {
        this.mapElementId = mapElementId;
        this.map = null;
        this.markers = [];
        this.polylines = [];
        this.currentInfoWindow = null;          // ensure exists
        this.realtimeMode = false;              // NEW
        this.realtimeStopTimes = {};            // NEW: { stop_id : [ rt rows ] }
        this._openStopId = null;                // NEW: which stop's window is open
        this._markerStopData = {};              // NEW: stop_id -> stop object
        // Vehicle layer
        this._vehicleMarkers = new Map();       // id -> { marker, data, el }
        this._markersByStopId = {};             // ADD: track stop markers
    }

    async initMap(mapId) {
        this.map = new google.maps.Map(document.getElementById(this.mapElementId), {
            center: { lat: 47.037872, lng: -122.900696 },
            zoom: 12,
            mapId: mapId
        });
        // Ensure marker library loaded for AdvancedMarkerElement (safe to call multiple times)
        if (google?.maps?.importLibrary) {
            try { await google.maps.importLibrary('marker'); } catch(_) {}
        }
    }

    _normalizeCollection(col) {
        if (!col) return [];
        if (Array.isArray(col)) return col;
        if (typeof col === 'object') return Object.values(col);
        return [];
    }

    _formatDisplayTime(val) {
        if (!val) return '';
        // ISO string
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val)) {
            const d = new Date(val);
            if (!isNaN(d)) {
                return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            }
        }
        // HH:MM(:SS)
        if (typeof val === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(val)) {
            const [h, m] = val.split(':');
            const d = new Date();
            d.setHours(+h % 24, +m, 0, 0);
            return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        // Epoch seconds
        if (typeof val === 'number') {
            const d = new Date(val * 1000);
            return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        // Fallback attempt parse
        const d = new Date(val);
        if (!isNaN(d)) {
            return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        return String(val);
    }

    _buildStopTimesHtml(stop) {
        const rawList = stop?.stop_times || stop?.StopTimes || [];
        const list = this._normalizeCollection(rawList);
        if (!list.length) {
            return '<div class="stop-times-list"><div class="stop-time none">No times</div></div>';
        }
        const items = list.map(st => {
            const arr = this._formatDisplayTime(st.arrival_time ?? st.arrival ?? st.ArrivalTime);
            const dep = this._formatDisplayTime(st.departure_time ?? st.departure ?? st.DepartureTime);
            return `
                <div class="stop-time cell-inner">
                    <div class="static-wrapper">
                        <div class="static-arrival">${arr || ''}</div>
                        <div class="static-departure">${dep || ''}</div>
                    </div>
                </div>`;
        }).join('');
        return `<div class="stop-times-list">${items}</div>`;
    }

    _flattenStops(node, acc = []) {
        if (!node) return acc;
        if (Array.isArray(node)) {
            node.forEach(n => this._flattenStops(n, acc));
            return acc;
        }
        if (typeof node === 'object') {
            // A stop object should have at least stop_id + (lat or lon)
            const isStop =
                Object.prototype.hasOwnProperty.call(node, 'stop_id') &&
                (Object.prototype.hasOwnProperty.call(node, 'stop_lat') ||
                 Object.prototype.hasOwnProperty.call(node, 'lat') ||
                 Object.prototype.hasOwnProperty.call(node, 'latitude'));
            if (isStop) {
                acc.push(node);
                return acc;
            }
            // Recurse into numeric / other keyed children
            Object.values(node).forEach(v => this._flattenStops(v, acc));
        }
        return acc;
    }

    _getStopsArray(mapData, directionId) {
        const dirKey = directionId != null ? String(directionId) : null;
        let raw = mapData?.Stops ?? mapData?.stops;

        // Case 1: keyed by direction id
        if (raw && dirKey && typeof raw === 'object' && !Array.isArray(raw) && raw.hasOwnProperty(dirKey)) {
            raw = raw[dirKey];
        }

        // Flatten whatever we now have
        const flat = this._flattenStops(raw);

        // If flat items have direction property, filter
        const filtered = dirKey
            ? flat.filter(s => {
                const d = s.direction_id ?? s.DirectionId ?? s.dir ?? null;
                return d == null ? true : String(d) === dirKey;
            })
            : flat;

        if (!filtered.length) {
            console.warn('[MapManager] No stops after direction filter', { directionId, rawShape: raw });
        }

        // Deduplicate
        const seen = new Set();
        return filtered.filter(s => {
            const lat = s.stop_lat ?? s.lat ?? s.latitude;
            const lon = s.stop_lon ?? s.lon ?? s.longitude;
            const key = `${s.stop_id}|${lat}|${lon}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    _getShapesArray(mapData, directionId) {
        const dirKey = directionId != null ? String(directionId) : null;
        let raw = mapData?.Shapes ?? mapData?.shapes;
        if (!raw) return [];

        // If keyed by direction id
        if (dirKey && raw && typeof raw === 'object' && !Array.isArray(raw) && raw.hasOwnProperty(dirKey)) {
            raw = raw[dirKey];
        }

        const list = Array.isArray(raw)
            ? raw
            : (typeof raw === 'object' ? Object.values(raw) : []);

        if (!dirKey) return list;

        // Filter if shapes carry direction info
        return list.filter(sh => {
            const d = sh.direction_id ?? sh.DirectionId ?? sh.dir;
            return d == null ? true : String(d) === dirKey;
        });
    }

    /* ---- NEW: determine if stop is a timepoint ---- */
    _isTimepointStop(stop) {
        if (!stop) return false;
        const v = stop.timepoint ?? stop.is_timepoint ?? stop.is_time_point;
        return v === 1 || v === '1' || v === true || v === 'true' || v === 'Y' || v === 'T';
    }

    /* ---- NEW: build DOM for AdvancedMarkerElement ---- */
    _buildMarkerElement(isTimepoint) {
        const wrapper = document.createElement('div');
        wrapper.className = isTimepoint
            ? 'gmap-marker gmap-timepoint-marker'
            : 'gmap-marker gmap-stop-marker';
        const shape = document.createElement('div');
        shape.className = 'shape';
        wrapper.appendChild(shape);
        return wrapper;
    }

    /* ---- NEW: create marker (AdvancedMarkerElement) ---- */
    _createStopMarker(position, title, infoWindow, isTimepoint = false, stopId = null) {
        // If this method already exists, keep existing styling logic for content element:
        const contentEl = this._buildMarkerElement(isTimepoint);
        const marker = new google.maps.marker.AdvancedMarkerElement({
            map: this.map,
            position,
            title,
            content: contentEl,
            zIndex: 100
        });
        contentEl.addEventListener('click', () => {
            if (this.currentInfoWindow) this.currentInfoWindow.close();
            infoWindow.open(this.map, marker);
            this.currentInfoWindow = infoWindow;
            if (stopId != null) {
                this._openStopId = String(stopId);
                // Rebuild with latest data after open
                infoWindow.setContent(this._buildInfoWindowHtml(this._markerStopData[this._openStopId]));
            }
        });
        return marker;
    }

    _getDirectionShapes(mapData, directionId) {
        const shapesRoot = mapData?.Shapes ?? mapData?.shapes;
        if (!shapesRoot) return [];
        const dirKey = directionId != null ? String(directionId) : null;

        // Pull bucket for the direction if keyed by direction
        let dirBucket = shapesRoot;
        if (dirKey && !Array.isArray(shapesRoot) && typeof shapesRoot === 'object' && shapesRoot.hasOwnProperty(dirKey)) {
            dirBucket = shapesRoot[dirKey];
        }

        // dirBucket now may be:
        // 1) Object: { shape_id: [points] , shape_id2: [points] }
        // 2) Array:  [ {shape_pt_lat,...}, ... ] (single shape)
        // 3) Nested object like { 12315_shp: Array(..), 12320_shp: Array(..) }
        const shapeArrays = [];

        const pushShape = (pointsArr) => {
            if (!Array.isArray(pointsArr) || !pointsArr.length) return;
            // Sort by sequence if present
            const sorted = [...pointsArr].sort((a,b) => {
                const sa = a.shape_pt_sequence ?? a.sequence ?? a.seq ?? 0;
                const sb = b.shape_pt_sequence ?? b.sequence ?? b.seq ?? 0;
                return sa - sb;
            });
            const path = sorted.map(p => ({
                lat: p.shape_pt_lat ?? p.lat ?? p.latitude,
                lng: p.shape_pt_lon ?? p.lon ?? p.longitude
            })).filter(pt => typeof pt.lat === 'number' && typeof pt.lng === 'number');
            if (path.length) shapeArrays.push(path);
        };

        const walkBucket = (bucket) => {
            if (!bucket) return;
            if (Array.isArray(bucket)) {
                // Either array of points or array of sub-shapes
                if (bucket.length && (bucket[0].shape_pt_lat !== undefined || bucket[0].lat !== undefined)) {
                    pushShape(bucket);
                } else {
                    bucket.forEach(sub => walkBucket(sub));
                }
                return;
            }
            if (typeof bucket === 'object') {
                Object.values(bucket).forEach(v => {
                    if (Array.isArray(v)) {
                        pushShape(v);
                    } else if (v && typeof v === 'object') {
                        walkBucket(v);
                    }
                });
            }
        };

        walkBucket(dirBucket);
        return shapeArrays;
    }

    /* ---- NEW / REPLACED: updateMap with direction filtering ---- */
    async updateMap(mapData, routeId, directionId, zoomLevel = null) {
        console.log('updateMap called with', { routeId, directionId });

        // Clear existing stop markers & polylines (keep vehicles if realtime)
        this.markers.forEach(m => { if (m.map) m.map = null; });
        this.markers = [];
        this._markersByStopId = {};
        this._markerStopData = {};
        if (!this.polylines) this.polylines = [];
        this.polylines.forEach(pl => pl.setMap(null));
        this.polylines = [];

        if (!mapData) return;

        // Shapes
        const shapePaths = this._getDirectionShapes
            ? this._getDirectionShapes(mapData, directionId)
            : this._getShapesArray?.(mapData, directionId) || [];
        const colorPalette = ['#FEE134','#662D91','#C2185B','#00A36D','#BF8500','#455A64'];

        shapePaths.forEach((path, i) => {
            const outline = new google.maps.Polyline({
                path,
                strokeColor: '#000000',
                strokeOpacity: 1,
                strokeWeight: 8,
                map: this.map,
                zIndex: 10
            });
            const colored = new google.maps.Polyline({
                path,
                strokeColor: colorPalette[i % colorPalette.length],
                strokeOpacity: 0.95,
                strokeWeight: 5,
                map: this.map,
                zIndex: 11
            });
            this.polylines.push(outline, colored);
        });

        // Stops
        const stops = this._getStopsArray ? this._getStopsArray(mapData, directionId) : [];
        const bounds = new google.maps.LatLngBounds();

        stops.forEach(stop => {
            const stopId = String(stop.stop_id ?? '');
            const lat = stop.stop_lat ?? stop.lat ?? stop.latitude;
            const lon = stop.stop_lon ?? stop.lon ?? stop.longitude;
            if (typeof lat !== 'number' || typeof lon !== 'number') return;

            this._markerStopData[stopId] = stop; // store for RT refresh

            const infoWindow = new google.maps.InfoWindow({
                content: this._buildInfoWindowHtml(stop) // USE unified builder (includes RT)
            });

            // pass stopId so click tracking works
            const marker = this._createStopMarker(
                { lat, lng: lon },
                stop.stop_name ?? '',
                infoWindow,
                this._isTimepointStop?.(stop),
                stopId
            );

            this._markersByStopId[stopId] = marker;
            this.markers.push(marker);
            bounds.extend({ lat, lng: lon });
        });

        shapePaths.forEach(path => path.forEach(pt => bounds.extend(pt)));
        if (!bounds.isEmpty()) this.map.fitBounds(bounds);

        // If a stop window was open, rebuild its content (e.g. after mode switch)
        this._refreshOpenInfoWindow();
    }

    // === REALTIME API (invoked by NavigationController) ===
    setRealtimeMode(flag) {
        this.realtimeMode = !!flag;
        this._refreshOpenInfoWindow();
    }

    setRealtimeStopTimes(stopTimesMap) {
        this.realtimeStopTimes = stopTimesMap || {};
        this._refreshOpenInfoWindow();
    }

    _refreshOpenInfoWindow() {
        if (!this.currentInfoWindow || !this._openStopId) return;
        const stopId = this._openStopId;
        const stopData = this._markerStopData[stopId];
        if (!stopData) return;
        this.currentInfoWindow.setContent(this._buildInfoWindowHtml(stopData));
    }

    // === UTILITIES (borrowed / aligned with TableManager) ===
    _formatDelay(delaySeconds) {
        if (delaySeconds === null || delaySeconds === undefined) return null;
        const sign = delaySeconds > 0 ? '+' : (delaySeconds < 0 ? '−' : '');
        const abs = Math.abs(delaySeconds);
        const mm = Math.floor(abs / 60);
        const ss = abs % 60;
        const body = mm ? `${mm}m${ss.toString().padStart(2,'0')}` : `${ss}s`;
        const className = delaySeconds === 0 ? 'ontime'
            : (delaySeconds > 0 ? 'late' : 'early');
        return { text: `${sign}${body}`, className };
    }

    _epochOrRawToDisplay(val) {
        if (val == null) return '';
        if (typeof val === 'number') return this._formatDisplayTime(val); // epoch seconds
        // Could be ISO / HH:MM:SS
        return this._formatDisplayTime(val);
    }

    // Merge + build HTML for a single stop
    _buildInfoWindowHtml(stop) {
        const stopId = stop.stop_id ?? stop.StopId ?? '';
        const stopName = stop.stop_name ?? stop.StopName ?? 'Stop';
        const rtList = (this.realtimeStopTimes && stopId != null)
            ? (this.realtimeStopTimes[String(stopId)] || [])
            : [];

        // Build realtime section
        let rtSection = '';
        if (this.realtimeMode && rtList.length) {
            const trimmed = rtList.slice(0, 8);
            const rows = trimmed.map(rt => {
                const arrTime = this._epochOrRawToDisplay(rt.arrival_time);
                const depTime = this._epochOrRawToDisplay(rt.departure_time);
                const dly = this._formatDelay(
                    rt.departure_delay != null ? rt.departure_delay : rt.arrival_delay
                );
                return `
                    <div class="rt-entry">
                        <span class="rt-arrival">${arrTime || ''}</span>
                        <span class="rt-sep">${(arrTime && depTime) ? '→' : ''}</span>
                        <span class="rt-departure">${depTime || ''}</span>
                        ${dly ? `<span class="delay ${dly.className}">${dly.text}</span>` : ''}
                    </div>`;
            }).join('');
            rtSection = `
                <div class="rt-section">
                    <div class="rt-header">Real-Time</div>
                    <div class="rt-list">${rows}</div>
                </div>`;
        }

        // Suppress scheduled table if realtime active & we have realtime rows
        let schedHtml = '';
        if (!(this.realtimeMode && rtList.length)) {
            schedHtml = this._buildStopTimesHtml(stop);
            // Optional: strip totally empty rows (all blank cells)
            if (schedHtml) {
                schedHtml = schedHtml.replace(/<tr[^>]*>(?:\s*<td[^>]*>\s*<\/td>\s*)+<\/tr>/gi, '');
            }
        }

        return `<div class="infobox">
            <strong>${stopName}</strong><br>
            <small>Stop ID: ${stopId}</small>
            ${rtSection}
            ${schedHtml}
        </div>`;
    }

    // (unchanged) _buildStopTimesHtml now only for scheduled list
    _buildStopTimesHtml(stop) {
        const rawList = stop?.stop_times || stop?.StopTimes || [];
        const list = this._normalizeCollection(rawList);
        if (!list.length) {
            return '<div class="stop-times-list"><div class="stop-time none">No times</div></div>';
        }
        const items = list.map(st => {
            const arr = this._formatDisplayTime(st.arrival_time ?? st.arrival ?? st.ArrivalTime);
            const dep = this._formatDisplayTime(st.departure_time ?? st.departure ?? st.DepartureTime);
            return `
                <div class="stop-time cell-inner">
                    <div class="static-wrapper">
                        <div class="static-arrival">${arr || ''}</div>
                        <div class="static-departure">${dep || ''}</div>
                    </div>
                </div>`;
        }).join('');
        return `<div class="stop-times-list">${items}</div>`;
    }

    // === Marker creation updated to use new HTML builder ===
    _createOrUpdateMarker(stop) {
        const stopId = String(stop.stop_id);
        const lat = stop.stop_lat ?? stop.lat ?? stop.latitude;
        const lon = stop.stop_lon ?? stop.lon ?? stop.longitude;
        if (typeof lat !== 'number' || typeof lon !== 'number') return;

        const isTimepoint = this._isTimepointStop(stop);
        let marker = this._markersByStopId[stopId];
        if (!marker) {
            const infoWindow = new google.maps.InfoWindow({
                content: this._buildInfoWindowHtml(stop)
            });
            marker = this._createStopMarker(
                { lat, lng: lon },
                stop.stop_name ?? '',
                infoWindow,
                isTimepoint
            );
            // Hook click to track open stop id
            marker.content.addEventListener('click', () => {
                this._openStopId = stopId;
            });
            this._markersByStopId[stopId] = marker;
            this.markers.push(marker);
        } else {
            // If we wanted to reposition / update we could
        }
        this._markerStopData[stopId] = stop;
    }

    // ================= VEHICLES (REFACTORED) =================

    setAllowedVehicleTripIds(tripIdSet) {
        this._vehicleAllowedTrips = tripIdSet || new Set();
        this._pruneVehicleMarkers();
    }

    /**
     * list item shape accepted:
     * {
     *   id, label, trip_id, base_trip_id?,
     *   lat, lon, bearing, speed, timestamp,
     *   position?:{lat,lon,bearing,speed}
     * }
     */
    setVehiclePositions(list) {
        if (!this.realtimeMode) {
            // If called while not in realtime, ensure cleared
            if (this._vehicleMarkers.size) this.clearVehicles();
            return;
        }
        if (!this.map || !Array.isArray(list)) return;

        const keep = new Set();
        list.forEach(v => {
            if (!v) return;
            const lat = v.lat;
            const lon = v.lon;
            if (typeof lat !== 'number' || typeof lon !== 'number') return;
            const id = v.id || v.label || `${lat},${lon}`;
            keep.add(id);

            let rec = this._vehicleMarkers.get(id);
            if (!rec) {
                const el = this._buildVehicleMarkerElement(v);
                const markerCtor = google?.maps?.marker?.AdvancedMarkerElement;
                if (!markerCtor) return; // library not ready
                const marker = new markerCtor({
                    map: this.map,
                    position: { lat, lng: lon },
                    content: el,
                    zIndex: 10000,
                    title: `Vehicle ${v.label || v.id || ''}`
                });
                el.addEventListener('click', () => {
                    new google.maps.InfoWindow({
                        content: this._buildVehicleInfoWindow(v)
                    }).open(this.map, marker);
                });
                this._vehicleMarkers.set(id, { marker, data: v, el });
            } else {
                // Update position / bearing
                const pos = rec.marker.position;
                if (!pos || pos.lat !== lat || pos.lng !== lon) {
                    rec.marker.position = { lat, lng: lon };
                }
                if (v.bearing != null) {
                    rec.el.style.setProperty('--bearing', v.bearing + 'deg');
                }
                rec.data = v;
            }
        });

        // Remove stale
        for (const [id, rec] of this._vehicleMarkers.entries()) {
            if (!keep.has(id)) {
                rec.marker.map = null;
                this._vehicleMarkers.delete(id);
            }
        }
    }

    clearVehicles() {
        for (const { marker } of this._vehicleMarkers.values()) {
            marker.map = null;
        }
        this._vehicleMarkers.clear();
    }

    _buildVehicleMarkerElement(v) {
        const el = document.createElement('div');
        el.className = 'vehicle-marker';
        el.style.setProperty('--bearing', (v.bearing || 0) + 'deg');
        el.innerHTML = `
          <div class="vehicle-anchor">
            <div class="bearing-wrapper">
              <div class="chevron-pointer">
                <svg class="chevron-svg" viewBox="0 0 60 60" aria-hidden="true" focusable="false">
                  <path d="M30 6 L48 28" />
                  <path d="M30 6 L12 28" />
                </svg>
              </div>
            </div>
            <div class="icon-circle" aria-hidden="true">
              <div class="bus-mask"></div>
            </div>
            <span class="sr-only">${(v.label || v.id || 'Vehicle')}</span>
          </div>
        `;
        return el;
    }

    _buildVehicleInfoWindow(v) {
        const bearing = v.bearing != null ? Math.round(v.bearing) + '°' : '—';
        const speed = v.speed != null ? (v.speed * 2.23694).toFixed(1) + ' mph' : '—';
        const ts = v.timestamp ? this._formatDisplayTime(v.timestamp) : '';
        return `<div class="vehicle-infobox">
            <strong>Vehicle ${v.label || v.id || ''}</strong><br>
            Trip: ${v.trip_id || ''}<br>
            Bearing: ${bearing}<br>
            Speed: ${speed}<br>
            Updated: ${ts}
        </div>`;
    }
}

export default MapManager;