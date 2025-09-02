import NavigationUIManager from "./navigation_ui_manager.js";
import NavigationDataService from "./navigation_data_service.js";
import GTFSDataService from "./gtfs_data_service.js";
import TableManager from "./table_manager.js";
import MapManager from "./map_manager.js";
import { tripUpdatesStore } from './trip_updates.js'; // ensure loaded
import { vehiclePositionsStore } from './vehicle_positions.js';
/**
 * Acts as a controller/facade between NavigationDataService and NavigationUIManager.
 */
class NavigationController {
    /**
     * @param {NavigationDataService} navigationDataService
     * @param {NavigationUIManager} uiManager
     * @param {GTFSDataService} gtfsDataService

    /**
     * Sets up event handlers for UI elements.
     */
    constructor() {
        this.data = null;
        this.ui = null;
        this.gtfsDataService = new GTFSDataService();
        this.gtfsRTDataService = new GTFSDataService();
        this.gtfsResponses = null;
        this.tableManager = new TableManager('stopTimesTables');
        this.map = null;
        this.showOnlyTimepoints = false; // NEW
        this.arrDepMode = 'arrivals'; // 'arrivals' | 'departures'
        this.viewMode = 'schedule'; // 'schedule' | 'realtime'
    }
    async initialize() {
        console.log('Initializing NavigationController...');
        this.data = new NavigationDataService();
        try { await this.data.load(); } catch (error) { console.error('Error loading calendar data:', error); return; }
        this.ui = new NavigationUIManager(this.data);
        try { await this.ui.initialize(this.data); } catch (e) { console.error('Error initializing navigation controller:', e); }
        this.map = await new MapManager('map');
        this.map.initMap('map');

        // Inject view mode toggle (Schedule / Real-Time) if not present
        if (!document.getElementById('viewModeToggle')) {
            // Prefer parent of existing scheduleButton (if present)
            const scheduleBtn = document.getElementById('scheduleButton');
            const targetBar = scheduleBtn?.parentElement || document.body;
            const wrapper = document.createElement('div');
            wrapper.innerHTML = `
                <div class="btn-group btn-stops-toggle btn-view-toggle" data-toggle="buttons" id="viewModeToggle" style="margin-left:8px;">
                    <label class="btn btn-primary active">
                        <input type="radio" name="view_mode_options" value="schedule" checked>Schedule
                    </label>
                    <label class="btn btn-default">
                        <input type="radio" name="view_mode_options" value="realtime">Real-Time
                    </label>
                </div>`;
            targetBar.appendChild(wrapper.firstElementChild);
            // Hide legacy buttons if they exist
            if (scheduleBtn) scheduleBtn.style.display = 'none';
            const rtBtn = document.getElementById('realTimeButton');
            if (rtBtn) rtBtn.style.display = 'none';
        }

        // Inject timepoint toggle if not present (unchanged)
        if (!document.getElementById('stopsDisplayToggle')) {
            const buttonsBar = document.getElementById('viewModeToggle')?.parentElement || document.body;
            const toggle = document.createElement('div');
            toggle.innerHTML = `
                <div class="btn-group btn-stops-toggle" data-toggle="buttons" id="stopsDisplayToggle" style="margin-left:8px;">
                    <label class="btn btn-primary active">
                        <input type="radio" name="display_stops_options" value="allstops" checked>All stops
                    </label>
                    <label class="btn btn-default">
                        <input type="radio" name="display_stops_options" value="timepoint">Timepoints
                    </label>
                </div>`;
            buttonsBar.appendChild(toggle.firstElementChild);
        }

        // Inject Arrivals / Departures toggle (2 options) if not present
        if (!document.getElementById('arrivalDepartureToggle')) {
            const buttonsBar =
                document.getElementById('stopsDisplayToggle')?.parentElement ||
                document.getElementById('viewModeToggle')?.parentElement ||
                document.body;

            const block = document.createElement('div');
            block.innerHTML = `
                <div class="btn-group btn-stops-toggle" data-toggle="buttons" id="arrivalDepartureToggle" style="margin-left:8px;">
                    <label class="btn btn-primary active">
                        <input type="radio" name="arr_dep_options" value="arrivals" checked>Arrivals
                    </label>
                    <label class="btn btn-default">
                        <input type="radio" name="arr_dep_options" value="departures">Departures
                    </label>
                </div>`;
            buttonsBar.appendChild(block.firstElementChild);
        }

        // Always default to Schedule view (ignore any persisted realtime)
        const scheduleRadio = document.querySelector('#viewModeToggle input[value="schedule"]');
        if (scheduleRadio) {
            scheduleRadio.checked = true;
        }
        this.setViewMode('schedule');
        try { localStorage.setItem('viewMode', 'schedule'); } catch(_) {}

        // Restore persisted stops toggle
        const savedStops = localStorage.getItem('stopsDisplayMode');
        if (savedStops === 'timepoint') {
            const tpInput = document.querySelector('#stopsDisplayToggle input[value="timepoint"]');
            if (tpInput) {
                tpInput.checked = true;
                this.showOnlyTimepoints = true;
                document.body.classList.add('show-timepoints-only');
            }
        }

        // Restore persisted Arr/Dep mode
        const savedAD = localStorage.getItem('arrivalDepartureMode');
        if (savedAD === 'departures') {
            const depInput = document.querySelector('#arrivalDepartureToggle input[value="departures"]');
            if (depInput) {
                depInput.checked = true;
                this.arrDepMode = 'departures';
            }
        } else {
            this.arrDepMode = 'arrivals';
        }
        this._applyArrivalDepartureMode(this.arrDepMode);

        // After all three toggle groups are created, insert scroll buttons.
        this._insertTableScrollButtons();
    }

    _insertTableScrollButtons() {
        if (document.getElementById('tableScrollLeft')) return; // already added

        // Choose a common parent (use parent of viewModeToggle if available)
        const viewToggle = document.getElementById('viewModeToggle');
        const parentBar = viewToggle?.parentElement || document.body;

        // Ensure parent is a flex row so we can push buttons to the right
        if (!parentBar.classList.contains('nav-bar-flex')) {
            parentBar.classList.add('nav-bar-flex');
            // Avoid clobbering existing inline styles; append
            parentBar.style.display = 'flex';
            parentBar.style.flexWrap = 'wrap';
            parentBar.style.alignItems = 'center';
            parentBar.style.gap = '8px';
        }

        // Wrapper that auto-pushes to right
        const wrapper = document.createElement('div');
        wrapper.className = 'table-scroll-btns';
        wrapper.style.marginLeft = 'auto';
        wrapper.style.display = 'flex';
        wrapper.style.gap = '10px';

        wrapper.innerHTML = `
            <button type="button" id="tableScrollLeft" class="table-scroll-btn" aria-label="Scroll table left">
                <svg viewBox="0 0 24 24" class="icon"><path d="M15 4 L7 12 L15 20" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </button>
            <button type="button" id="tableScrollRight" class="table-scroll-btn" aria-label="Scroll table right">
                <svg viewBox="0 0 24 24" class="icon"><path d="M9 4 L17 12 L9 20" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            </button>
        `;
        parentBar.appendChild(wrapper);

        // Attach handlers now (or in setupEventHandlers)
        const scrollAmount = 420; // px per click
        const tableScroller = () => document.querySelector('.table-responsive');

        const leftBtn = wrapper.querySelector('#tableScrollLeft');
        const rightBtn = wrapper.querySelector('#tableScrollRight');

        const doScroll = dir => {
            const el = tableScroller();
            if (!el) return;
            el.scrollBy({ left: dir * scrollAmount, behavior: 'smooth' });
        };

        leftBtn.addEventListener('click', () => doScroll(-1));
        rightBtn.addEventListener('click', () => doScroll(1));
    }

    setupEventHandlers() {
        console.log('Setting up event handlers...');
        $('#date').on('change', (event) => this.handleDateChange(event));
        $('#route_id').on('change', () => this.handleRouteChange());
        $('#direction_toggle').on('change', () => this.handleDirectionChange());
        $('#toggleDirectionButton').on('click', () => {
            const $directionToggle = $('#direction_toggle');
            const currentVal = $directionToggle.val();
            const options = $directionToggle.find('option').map(function() { return $(this).val(); }).get();
            const currentIndex = options.indexOf(currentVal);
            const nextIndex = (currentIndex + 1) % options.length;
            $directionToggle.val(options[nextIndex]).trigger('change');
        });

        // Remove old individual handlers (legacy buttons may be hidden)
        $('#scheduleButton').off('click');
        $('#realTimeButton').off('click');

        // View mode toggle
        const viewContainer = document.getElementById('viewModeToggle');
        if (viewContainer) {
            viewContainer.addEventListener('change', () => {
                const val = viewContainer.querySelector('input[name="view_mode_options"]:checked')?.value;
                this.setViewMode(val === 'realtime' ? 'realtime' : 'schedule');
                try { localStorage.setItem('viewMode', val); } catch(_) {}
                this._syncViewModeToggle();
            });
            this._syncViewModeToggle();
        }

        // Timepoint toggle
        const stopsContainer = document.getElementById('stopsDisplayToggle');
        if (stopsContainer) {
            stopsContainer.addEventListener('change', () => {
                const val = stopsContainer.querySelector('input[name="display_stops_options"]:checked')?.value;
                this.showOnlyTimepoints = (val === 'timepoint');
                if (this.showOnlyTimepoints) document.body.classList.add('show-timepoints-only');
                else document.body.classList.remove('show-timepoints-only');
                try { localStorage.setItem('stopsDisplayMode', this.showOnlyTimepoints ? 'timepoint' : 'allstops'); } catch(_) {}
                this.tableManager?.enforceTimepointFilter?.(this.showOnlyTimepoints);
                this._syncStopsToggleActive();
            });
            this._syncStopsToggleActive();
        }

        // Arrivals / Departures toggle (2-option)
        const adContainer = document.getElementById('arrivalDepartureToggle');
        if (adContainer) {
            adContainer.addEventListener('change', () => {
                const val = adContainer.querySelector('input[name="arr_dep_options"]:checked')?.value || 'arrivals';
                this.arrDepMode = (val === 'departures') ? 'departures' : 'arrivals';
                this._applyArrivalDepartureMode(this.arrDepMode);
                try { localStorage.setItem('arrivalDepartureMode', this.arrDepMode); } catch(_) {}
                this._syncArrivalDepartureToggle();
            });
            this._syncArrivalDepartureToggle();
        }

        $('#openMapButton').on('click', function (e) {
            e.preventDefault();
            const offcanvasEl = document.getElementById('mapFlyout');
            if (offcanvasEl) {
                const bsOffcanvas = bootstrap.Offcanvas.getOrCreateInstance(offcanvasEl);
                bsOffcanvas.show();
            }
        });
    }

    _syncViewModeToggle() {
        const container = document.getElementById('viewModeToggle');
        if (!container) return;
        container.querySelectorAll('label.btn').forEach(label => {
            const input = label.querySelector('input');
            if (input?.checked) {
                label.classList.add('active','btn-primary');
                label.classList.remove('btn-default');
            } else {
                label.classList.remove('active','btn-primary');
                label.classList.add('btn-default');
            }
        });
    }

    _syncStopsToggleActive() {
        const container = document.getElementById('stopsDisplayToggle');
        if (!container) return;
        container.querySelectorAll('label.btn').forEach(label => {
            const input = label.querySelector('input');
            if (input?.checked) {
                label.classList.add('active','btn-primary');
                label.classList.remove('btn-default');
            } else {
                label.classList.remove('active','btn-primary');
                label.classList.add('btn-default');
            }
        });
    }

    _applyArrivalDepartureMode(mode) {
        document.body.classList.remove('show-arrivals-only','show-departures-only');
        if (mode === 'arrivals') document.body.classList.add('show-arrivals-only');
        else document.body.classList.add('show-departures-only');
    }

    _syncArrivalDepartureToggle() {
        const container = document.getElementById('arrivalDepartureToggle');
        if (!container) return;
        container.querySelectorAll('label.btn').forEach(label => {
            const input = label.querySelector('input');
            if (input?.checked) {
                label.classList.add('active','btn-primary');
                label.classList.remove('btn-default');
            } else {
                label.classList.remove('active','btn-primary');
                label.classList.add('btn-default');
            }
        });
    }

    async handleDateChange() {
        const params = this.buildParams();
        if (!params) return;
        this.gtfsResponses = await this.fetchStopTimes(params);
        this._updateDirectionToggle(); // ensure direction names from top-level Directions
        this.updateTable();
        this.map.updateMap(this.gtfsResponses.MapInfo, params.route_id, params.direction_id);
    }

    async handleRouteChange() {
        const params = this.buildParams();
        if (!params) return;
        this.gtfsResponses = await this.fetchStopTimes(params);

        // Refresh direction options for new route
        this._updateDirectionToggle();

        // Rebuild params after potential direction change
        const newParams = this.buildParams();
        if (!newParams) return;

        this.updateTable();
        this.map.updateMap(this.gtfsResponses.MapInfo, newParams.route_id, newParams.direction_id);

        // Update header (route + headsign)
        this._updateRouteHeader();

        if (document.body.classList.contains('realtime-mode')) {
            const rtStopMap = await this._fetchTripUpdatesForMap(newParams.route_id, newParams.direction_id);
            this.map?.setRealtimeStopTimes?.(rtStopMap);
        }

        await this._postStopTimesUpdate();
    }

    async handleDirectionChange() {
        const params = this.buildParams();
        if (!params) return;
        if (!this.gtfsResponses) {
            this.gtfsResponses = await this.fetchStopTimes(params);
        }
        this.updateTable();
        this.map.updateMap(this.gtfsResponses.MapInfo, params.route_id, params.direction_id);

        this._updateRouteHeader();

        if (document.body.classList.contains('realtime-mode')) {
            const rtStopMap = await this._fetchTripUpdatesForMap(params.route_id, params.direction_id);
            this.map?.setRealtimeStopTimes?.(rtStopMap);
        }

        await this._postStopTimesUpdate();
    }

    async _postStopTimesUpdate() {
        const params = this.buildParams?.();
        if (!params) return;
        const { route_id, direction_id } = params;
        if (this.gtfsResponses?.MapInfo) {
            this.map.updateMap(this.gtfsResponses.MapInfo, route_id, direction_id);
        }
        // (Realtime stop times logic stays)
        try {
            await vehiclePositionsStore.refresh();
            const vehicles = vehiclePositionsStore.getVehiclesForRoute(route_id);
            this.map.setVehiclePositions(vehicles);
        } catch (e) {
            console.warn('[Vehicles] fetch failed', e);
        }
    }

    _updateAllowedVehicleTrips(direction_id) {
        const dirData = this.gtfsResponses?.StopTimesTables?.[direction_id] || [];
        const tripSet = new Set();
        dirData.forEach(stopRow => {
            if (stopRow?.trips) {
                Object.keys(stopRow.trips).forEach(tid => tripSet.add(tid));
            }
        });
        this.map.setAllowedVehicleTripIds(tripSet);
    }

    async _refreshVehiclePositions(routeId) {
        if (!window.vehiclePositionsStore) return;
        try {
            await window.vehiclePositionsStore.refresh();
            // Filter vehicles: only those whose trip_id in allowed set (MapManager enforces),
            // optionally also match route_id to reduce passes.
            const candidates = window.vehiclePositionsStore.getVehiclesForRoute(routeId) || [];
            this.map.setVehiclePositions(candidates);
        } catch (e) {
            console.warn('[NavigationController] vehicle positions refresh failed', e);
        }
    }

    /**
     * Fetch stop times for a given schedule, route, and direction.
     * @param {Object} params - { date, route_id, schedule_id, service_ids, direction_id }
     * @returns {Promise<Object>}
     */    

    async fetchStopTimes(params) {
        console.log('Fetching stop times with params:', params);
        try {
            const response = await this.gtfsDataService.getData(params);
            console.log('Stop times fetched successfully:', response);
            console.log(response.StopTimesTables);
            $('#openMapButton').removeClass('d-none');
            $('#printButton').removeClass('d-none');
            return response;
        } catch (error) {
            console.error('Error fetching stop times:', error);
        }
    }
    
    async updateTable() {
        try {
            const params = this.buildParams();
            if (!params) return;
            const { direction_id, route_id } = params;
            const directionData = this.gtfsResponses?.StopTimesTables?.[direction_id] || [];

            await this.tableManager.update(route_id, direction_id);
            this.tableManager.render(directionData, direction_id);

            if (this.tableManager.enforceTimepointFilter) {
                this.tableManager.enforceTimepointFilter(this.showOnlyTimepoints);
            }

            this._applyArrivalDepartureMode(this.arrDepMode);

            // NEW: update header here (single responsibility)
            this._updateRouteHeader();
        } catch (error) {
            console.error('Error initializing TableManager:', error);
        }

    }

    buildMap() {
        const params = this.buildParams();
        if (!params) return;
        if (this.map) {
            this.map.updateMap(this.data.mapInfo, params.route_id, params.direction_id);
        } else {
            console.warn('MapManager is not initialized.');
        }
    }

    buildParams() {
        // Ensure scheduleId/serviceIds are set
        if (!this.data.scheduleId) {
            const selectedDate = $('#date').val();
            const dateData = this.data.calendarData.dates[selectedDate];
            if (dateData) {
                this.data.scheduleId = dateData.schedule_id;
                this.data.serviceIds = dateData.service_ids;
            } else {
                console.warn('No data found for selected date:', selectedDate);
                return null;
            }
        }
        return {
            date: $('#date').val(),
            route_id: $('#route_id').val(),
            schedule_id: this.data.scheduleId,
            service_ids: this.data.serviceIds,
            direction_id: $('#direction_toggle').val()
        };
    }    
    async setViewMode(mode) {
        this.viewMode = mode;
        if (mode === 'realtime') {
            await this._ensureTodayAndRefresh();
            document.body.classList.remove('schedule-mode');
            document.body.classList.add('realtime-mode');
            this.map?.setRealtimeMode?.(true);

            const params = this.buildParams();
            if (params?.route_id) {
                const rtStopMap = await this._fetchTripUpdatesForMap(params.route_id, params.direction_id);
                this.map?.setRealtimeStopTimes?.(rtStopMap);
            }

            if (this._rtMapInterval) clearInterval(this._rtMapInterval);
            this._rtMapInterval = setInterval(async () => {
                const p = this.buildParams();
                if (!p?.route_id) return;
                const rtStopMap = await this._fetchTripUpdatesForMap(p.route_id, p.direction_id);
                this.map?.setRealtimeStopTimes?.(rtStopMap);
            }, 15000);
        } else {
            document.body.classList.remove('realtime-mode');
            document.body.classList.add('schedule-mode');
            this.map?.setRealtimeMode?.(false);
            this.map?.setRealtimeStopTimes?.(null);
            if (this._rtMapInterval) {
                clearInterval(this._rtMapInterval);
                this._rtMapInterval = null;
            }
        }
        this._updateDisplayDateVisibility?.();

        // Ensure vehicles refresh on interval
        if (!this._vehicleInterval) {
            this._vehicleInterval = setInterval(() => {
                const params = this.buildParams?.();
                if (params?.route_id) this._refreshVehiclePositions(params.route_id);
            }, 15000);
        }
        if (mode !== 'realtime') {
            // still show vehicles in schedule mode; remove this block if you want hide instead
        }
    }

    _getPacificToday() {
        // Returns YYYY-MM-DD for current date in America/Los_Angeles
        const fmt = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Los_Angeles',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        return fmt.format(new Date()); // en-CA gives YYYY-MM-DD
    }

    async _ensureTodayAndRefresh() {
        const todayStr = this._getPacificToday(); // was UTC-based toISOString().slice(0,10)
        const $dateInput = $('#date');
        const currentVal = $dateInput.val();

        if (currentVal === todayStr) {
            return; // already today in Pacific time
        }

        this.data.scheduleId = null;
        this.data.serviceIds = null;
        $dateInput.val(todayStr);

        const params = this.buildParams();
        if (params) {
            this.gtfsResponses = await this.fetchStopTimes(params);
            await this.updateTable();
        }
    }

    _buildRealtimeStopMapFromStore(routeId, directionId) {
        if (!routeId || !tripUpdatesStore) return {};
        const dirKey = directionId != null ? String(directionId) : null;
        const trips = tripUpdatesStore.getTripsByRoute(String(routeId)) || [];
        const stopMap = {};
        const normTs = t => {
            if (!t) return Infinity;
            if (typeof t === 'number') return t * 1000;
            const d = new Date(t);
            return isNaN(d) ? Infinity : d.getTime();
        };

        trips.forEach(tripEntity => {
            // tripEntity might already be the TripUpdate object or may wrap it
            const tu = tripEntity.TripUpdate || tripEntity;
            const trip = tu.Trip || tu.trip || {};
            const tripId = trip.TripId || trip.trip_id;
            const tripDir = trip.direction_id != null ? String(trip.direction_id) : null;
            if (dirKey && tripDir && tripDir !== dirKey) return;

            // Prefer store API if available
            const updates = tripUpdatesStore.stopTimeUpdatesForTrip
                ? (tripUpdatesStore.stopTimeUpdatesForTrip(tripId) || [])
                : (tu.StopTimeUpdates || tu.stop_time_updates || []);

            updates.forEach(u => {
                const stopId = String(
                    u.stop_id ?? u.StopId ??
                    u.stop?.id ??
                    u.Stop?.Id ?? ''
                );
                if (!stopId) return;

                const updDir = u.direction_id != null
                    ? String(u.direction_id)
                    : (tripDir || null);
                if (dirKey && updDir && updDir !== dirKey) return;

                // Extract times (support nested Arrival / Departure or flat fields)
                const arrivalTime =
                    u.arrival_time ?? u.Arrival?.Time ?? u.arrival?.time ?? u.arrival;
                const departureTime =
                    u.departure_time ?? u.Departure?.Time ?? u.departure?.time ?? u.departure;
                const arrivalDelay =
                    u.arrival_delay ?? u.Arrival?.Delay ?? u.arrival?.delay;
                const departureDelay =
                    u.departure_delay ?? u.Departure?.Delay ?? u.departure?.delay;

                (stopMap[stopId] ||= []).push({
                    trip_id: tripId,
                    arrival_time: arrivalTime,
                    departure_time: departureTime,
                    arrival_delay: arrivalDelay,
                    departure_delay: departureDelay
                });
            });
        });

        // Sort & trim per stop
        Object.keys(stopMap).forEach(k => {
            stopMap[k] = stopMap[k]
                .sort((a, b) =>
                    Math.min(normTs(a.arrival_time), normTs(a.departure_time)) -
                    Math.min(normTs(b.arrival_time), normTs(b.departure_time)))
                .slice(0, 6);
        });
        return stopMap;
    }

    async _fetchTripUpdatesForMap(routeId, directionId) {
        try {
            return this._buildRealtimeStopMapFromStore(routeId, directionId);
        } catch (e) {
            console.warn('Realtime stop map build failed', e);
            return {};
        }
    }

    // In NavigationController after getting scheduled + rt data
    _buildMergedPerStop(scheduleStopsArray, rtStopMap) {
        const merged = {};
        for (const stop of scheduleStopsArray) {
            const sid = String(stop.stop_id);
            const schedTrips = [];
            if (stop.trips) {
                for (const [tripId, t] of Object.entries(stop.trips)) {
                    schedTrips.push({
                        trip_id: tripId,
                        headsign: t.trip_headsign || t.headsign || '',
                        route: t.route_short_name || '',
                        sched_arr: t.arrival_time,
                        sched_dep: t.departure_time
                    });
                }
            }
            const rtList = rtStopMap[sid] || [];
            const byTrip = new Map();
            schedTrips.forEach(s => byTrip.set(s.trip_id, { ...s }));
            rtList.forEach(r => {
                const row = byTrip.get(r.trip_id) || { trip_id: r.trip_id };
                row.headsign = r.trip_headsign || r.headsign || row.headsign || '';
                row.route = r.route_short_name || row.route || '';
                row.rt_arr = r.arrival_time;
                row.rt_dep = r.departure_time;
                row.arr_delay = r.arrival_delay;
                row.dep_delay = r.departure_delay;
                byTrip.set(r.trip_id, row);
            });
            let arr = Array.from(byTrip.values());
            arr.sort((a,b) =>
                (this._toSec(a.rt_dep || a.rt_arr || a.sched_dep || a.sched_arr) -
                 this._toSec(b.rt_dep || b.rt_arr || b.sched_dep || b.sched_arr)));
            merged[sid] = arr.slice(0, 8); // trim early
        }
        return merged;
    }
    _toSec(t) {
        if (!t) return 1e12;
        if (typeof t === 'number') return t;
        const p = t.split(':').map(n=>+n);
        if (p.length < 2 || p.some(isNaN)) return 1e12;
        return p[0]*3600 + p[1]*60 + (p[2]||0);
    }

    _updateDirectionToggle() {
        const select = $('#direction_toggle');
        if (!select.length) return;
        const resp = this.gtfsResponses || {};

        // Prefer top-level Directions if present
        const dirs = resp.Directions;
        let entries = [];

        if (Array.isArray(dirs) && dirs.length) {
            // Array case: indices 0,1,...
            entries = dirs.map((label, i) => [String(i), label]);
        } else if (dirs && typeof dirs === 'object') {
            // Object case: keys "0","1"
            entries = Object.keys(dirs)
                .sort((a,b)=>Number(a)-Number(b))
                .map(k => [k, dirs[k]]);
        } else {
            // Fallback to StopTimesTables keys (previous behavior)
            const stopTables = resp.StopTimesTables;
            if (stopTables && typeof stopTables === 'object') {
                entries = Object.keys(stopTables)
                    .sort((a,b)=>Number(a)-Number(b))
                    .map(k => [k, this._directionDisplayName(k)]);
            }
        }

        if (!entries.length) return;

        const prevVal = select.val();
        select.empty();
        entries.forEach(([val,label]) => {
            const safe = (label && String(label).trim()) || `Direction ${val}`;
            select.append(`<option value="${val}">${safe}</option>`);
        });

        // Restore previous selection if still available
        if (prevVal && select.find(`option[value="${prevVal}"]`).length) {
            select.val(prevVal);
        } else {
            select.val(entries[0][0]);
        }
    }

    _directionDisplayName(directionId) {
        const resp = this.gtfsResponses || {};
        const dirs = resp.Directions;

        // Top-level Directions preferred
        if (Array.isArray(dirs)) {
            const i = parseInt(directionId,10);
            if (!isNaN(i) && dirs[i]) return dirs[i];
        } else if (dirs && typeof dirs === 'object' && dirs[directionId]) {
            return dirs[directionId];
        }

        // Previous fallbacks
        const routeInfo = resp.RouteInfo || {};
        if (routeInfo.direction_names && Array.isArray(routeInfo.direction_names)) {
            const i = parseInt(directionId,10);
            if (!isNaN(i) && routeInfo.direction_names[i]) return routeInfo.direction_names[i];
        }
        if (routeInfo.trip_headsigns && Array.isArray(routeInfo.trip_headsigns)) {
            const i = parseInt(directionId,10);
            if (!isNaN(i) && routeInfo.trip_headsigns[i]) return routeInfo.trip_headsigns[i];
        }
        const dirInfo = resp.MapInfo?.DirectionInfo;
        if (dirInfo && dirInfo[directionId]?.name) return dirInfo[directionId].name;

        return `Direction ${directionId}`;
    }

    _updateRouteHeader() {
        const params = this.buildParams?.();
        if (!params) return;
        const routeInfo = this.gtfsResponses?.RouteInfo || {};
        const routeShortName = routeInfo.route_short_name || params.route_id || '';
        const routeLongName = routeInfo.route_long_name || '';
        const tripHeadsign = $('#direction_toggle option:selected').text() || '';
        let formattedDate = '';
        if (params.date) {
            const dateObj = new Date(params.date + 'T00:00:00');
            if (!isNaN(dateObj)) {
                formattedDate = dateObj.toLocaleDateString('en-US', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });
            }
        }
        $('#routeName').html(
            `${routeShortName}${routeLongName ? ' - ' + routeLongName : ''}` +
            `<div id="tripHeadsign">${tripHeadsign}</div>` +
            `<div id="formattedDate">${formattedDate}</div>`
        );
    }
}

export default NavigationController;
