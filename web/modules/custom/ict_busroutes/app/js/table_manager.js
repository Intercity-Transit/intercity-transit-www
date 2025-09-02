class TableManager {
    constructor(tableElementId) {
        this.tableElementId = tableElementId;
        this.dataSource = null;
        this.includeRealTime = true;
        this.realTimeQueues = {};
        this.rtUsage = {};
        this.lastTripIdList = [];
        this.serviceDateDisplay = null; // localized display date (e.g. 08/16/2025)
    }

    // Unified timepoint detector (backend provides `timepoint: 1`)
    isTimepointRow(row) {
        if (!row) return false;
        const v = row.is_timepoint ?? row.timepoint ?? row.is_time_point;
        return v === 1 || v === '1' || v === true || v === 'true' || v === 'Y' || v === 'T';
    }

    async update(routeId, directionId, zoomLevel = null) {
        if (this.includeRealTime) {
            if (!window.tripUpdatesStore) {
                console.warn('[TableManager] tripUpdatesStore not loaded yet');
            } else {
                try {
                    await window.tripUpdatesStore.refresh();
                    console.debug('[TableManager] RT refreshed: trips=', window.tripUpdatesStore.byTripId.size);
                } catch(e) {
                    console.warn('[TableManager] RT refresh failed', e);
                }
            }
        }
        // fetch static data then:
        // this.render(staticStopTimes, directionId);
    }

    buildRealTimeQueues() {
        this.realTimeQueues = {};
        if (!this.includeRealTime) return;
        const store = window.tripUpdatesStore;
        if (!store) {
            return;
        }
        for (const [tripId, ent] of store.byTripId.entries()) {
            const ups = ent?.TripUpdate?.StopTimeUpdates;
            if (!Array.isArray(ups) || ups.length === 0) continue;
            const q = ups
                .filter(u => u && (u.StopId !== undefined && u.StopId !== null))
                .map(u => {
                    const arr = u.Arrival || {};
                    const dep = u.Departure || {};
                    return {
                        stop_id: String(u.StopId),
                        arrival_time: typeof arr.Time === 'number' ? arr.Time : null,
                        arrival_delay: typeof arr.Delay === 'number' ? arr.Delay : null,
                        departure_time: typeof dep.Time === 'number' ? dep.Time : null,
                        departure_delay: typeof dep.Delay === 'number' ? dep.Delay : null
                    };
                });
            if (q.length) this.realTimeQueues[tripId] = q;
        }
        // Debug head of each queue
        // console.debug('[buildRealTimeQueues]', Object.entries(this.realTimeQueues).map(([t,q]) => [t, q[0]]));
    }

    // Convert epoch seconds to formatted string compatible with formatTime display style
    formatEpoch(epochSeconds) {
        if (!epochSeconds) return null;
        return new Date(epochSeconds * 1000).toISOString();
    }

    formatDelay(delaySeconds) {
        if (delaySeconds === null || delaySeconds === undefined) return null;
        const sign = delaySeconds > 0 ? '+' : (delaySeconds < 0 ? '−' : '');
        const abs = Math.abs(delaySeconds);
        const mm = Math.floor(abs / 60);
        const ss = abs % 60;
        const body = mm ? `${mm}m${ss.toString().padStart(2,'0')}` : `${ss}s`;
        return { text: `${sign}${body}`, className: delaySeconds === 0 ? 'on-time' : (delaySeconds > 0 ? 'late' : 'early') };
    }

    // Derive (once per render session) the base service date used to suppress date display
    _ensureServiceDate(stopTimesTable) {
        if (this.serviceDateDisplay) return;
        for (const row of stopTimesTable) {
            if (!row.trips) continue;
            for (const tripId of Object.keys(row.trips)) {
                const tObj = row.trips[tripId];
                const dt = tObj?.arrival_time || tObj?.departure_time;
                if (dt) {
                    this.serviceDateDisplay = new Date(dt).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'numeric', day: 'numeric'
                    });
                    return;
                }
            }
        }
    }

    render(stopTimesTable, directionId) {
        this.buildRealTimeQueues();
        this._ensureServiceDate(stopTimesTable); // set baseline date if not already
        const container = document.getElementById(this.tableElementId);
        container.innerHTML = '';
        if (!stopTimesTable || stopTimesTable.length === 0) {
            container.innerHTML = '<div>No data available.</div>';
            return;
        }

        // Collect trip ids (unsorted)
        const allTripIds = new Set();
        stopTimesTable.forEach(r => {
            if (r.trips) Object.keys(r.trips).forEach(id => allTripIds.add(id));
        });

        // ORDER trip ids by mean scheduled time (arrival_time preferred, else departure_time)
        const meanScoreForTrip = (tripId) => {
            let sum = 0;
            let count = 0;
            stopTimesTable.forEach(row => {
                const tripObj = row.trips?.[tripId];
                if (!tripObj) return;
                const tStr = tripObj.arrival_time || tripObj.departure_time;
                if (!tStr) return;
                const ms = Date.parse(tStr);
                if (!isNaN(ms)) {
                    sum += ms;
                    count += 1;
                }
            });
            if (!count) return Number.POSITIVE_INFINITY; // push empty / all-missing to end
            return sum / count;
        };

        let tripIdList = Array.from(allTripIds).map(tripId => ({
            tripId,
            score: meanScoreForTrip(tripId)
        })).sort((a,b) => {
            if (a.score === b.score) return a.tripId.localeCompare(b.tripId);
            return a.score - b.score;
        }).map(o => o.tripId);

        // If everything ended up with Infinity (no times parsed), fallback to original alpha
        if (tripIdList.every(id => !stopTimesTable.some(r => {
            const t = r.trips?.[id];
            return t && (t.arrival_time || t.departure_time);
        }))) {
            tripIdList = Array.from(allTripIds).sort();
        }

        this.lastTripIdList = tripIdList;
        this.rtUsage = {};
        tripIdList.forEach(t => this.rtUsage[t] = false);

        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-responsive direction-table-wrapper';
        tableWrapper.dataset.directionId = directionId;

        const tableElement = document.createElement('table');
        tableElement.className = 'table direction-table';
        tableElement.dataset.directionId = directionId;

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        // Stop info header
        const stopInfoTh = document.createElement('th');
        stopInfoTh.textContent = 'Stop Info';
        stopInfoTh.classList.add('header-cell');
        headerRow.appendChild(stopInfoTh);

        // Trip headers with data-trip-id
        tripIdList.forEach(tripId => {
            const th = document.createElement('th');
            th.textContent = tripId;
            th.dataset.tripId = tripId;
            th.classList.add('header-cell');
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        tableElement.appendChild(thead);

        const tbody = document.createElement('tbody');
        // Rows
        stopTimesTable.forEach(row => {
            const tr = document.createElement('tr');
            if (this.isTimepointRow(row)) {
                tr.classList.add('timepoint');
                tr.dataset.timepoint = '1';
            }

            // Stop info cell (integrated legacy timepoint <aside> markup)
            const stopInfoCell = document.createElement('th');
            const isTP = this.isTimepointRow(row);
            if (isTP) stopInfoCell.classList.add('timepoint');

            // Updated markup: structured blocks, no <br>, stop_id clearly below name
            const stopInfoInner = `
                <div class="stop-info">
                    <div class="stop-name">${row.stop_name}</div>
                    <div class="stop-id">Stop ID# ${row.stop_id}</div>
                </div>
            `;

            stopInfoCell.innerHTML = isTP
                ? `<aside><h3 class="timepoint">Timepoint</h3>${stopInfoInner}</aside>`
                : stopInfoInner;

            tr.appendChild(stopInfoCell);

            // Trip columns
            tripIdList.forEach(tripId => {
                const td = document.createElement('td');
                let value = '';
                let departure = '';
                if (row.trips && row.trips[tripId]) {
                    value = row.trips[tripId].arrival_time || '';
                    departure = row.trips[tripId].departure_time || '';
                }

                const staticParts = [];
                if (value) {
                    const { innerHTML } = this.formatTime(value);
                    staticParts.push(`<div class="static-arrival">${innerHTML}</div>`);
                }
                if (departure) {
                    const { innerHTML: depHTML } = this.formatTime(departure);
                    staticParts.push(`<div class="static-departure">${depHTML}</div>`);
                }

                // Real-time overlay
                const rtParts = [];
                const q = this.realTimeQueues[tripId];
                if (q && q.length && String(row.stop_id) === q[0].stop_id) {
                    const rt = q.shift();
                    const rtArrStr = this.formatEpoch(rt.arrival_time);
                    const rtDepStr = this.formatEpoch(rt.departure_time);
                    const arrDelayFmt = this.formatDelay(rt.arrival_delay);
                    const depDelayFmt = this.formatDelay(rt.departure_delay);

                    // Arrival (show time if present; always show delay if available)
                    if (rtArrStr || arrDelayFmt) {
                        let rtArrHTML = '';
                        if (rtArrStr) {
                            rtArrHTML = this.formatTime(rtArrStr).innerHTML;
                        }
                        rtParts.push(
                            `<div class="rt-arrival">
                                ${rtArrHTML || ''}
                                ${arrDelayFmt ? `<span class="delay rt-delay ${arrDelayFmt.className}">Arr Δ ${arrDelayFmt.text}</span>` : ''}
                             </div>`
                        );
                    }

                    // Departure (show time if present; always show delay if available)
                    if (rtDepStr || depDelayFmt) {
                        let rtDepHTML = '';
                        if (rtDepStr) {
                            rtDepHTML = this.formatTime(rtDepStr).innerHTML;
                        }
                        rtParts.push(
                            `<div class="rt-departure">
                                ${rtDepHTML || ''}
                                ${depDelayFmt ? `<span class="delay rt-delay ${depDelayFmt.className}">Dep Δ ${depDelayFmt.text}</span>` : ''}
                             </div>`
                        );
                    }

                    if (rtParts.length) {
                        td.classList.add('rt-updated');
                        this.rtUsage[tripId] = true;
                    }
                }

                td.innerHTML = `
                    <div class="cell-inner">
                        <div class="static-wrapper">${staticParts.join('')}</div>
                        <div class="rt-wrapper">${rtParts.join('')}</div>
                    </div>
                `.trim();
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        tableElement.appendChild(tbody);
        tableWrapper.appendChild(tableElement);
        container.appendChild(tableWrapper);

        // After full render, apply column filtering
        this.applyRealtimeColumnFiltering(tripIdList);

        // Re-apply timepoint filter if body class set
        const showOnly = document.body.classList.contains('show-timepoints-only');
        this.enforceTimepointFilter(showOnly);
    }

    enforceTimepointFilter(showOnlyTimepoints) {
        const selector = `#${this.tableElementId} tbody tr`;
        document.querySelectorAll(selector).forEach(tr => {
            if (!showOnlyTimepoints) {
                tr.style.display = '';
            } else {
                tr.style.display = tr.classList.contains('timepoint') ? '' : 'none';
            }
        });
    }

    applyRealtimeColumnFiltering(tripIdList) {
        const table = document.querySelector(`#${this.tableElementId} table.direction-table`);
        if (!table) return;
        const hasRealtimeMode = document.body.classList.contains('realtime-mode');
        // Add / remove empty marker classes
        tripIdList.forEach((tripId, idx) => {
            const nth = idx + 2; // +1 for 1-based, +1 for Stop Info column
            const colHasRT = !!this.rtUsage[tripId];
            const headerCell = table.querySelector(`thead th:nth-child(${nth})`);
            if (headerCell) {
                if (!colHasRT) headerCell.classList.add('rt-empty-col'); else headerCell.classList.remove('rt-empty-col');
            }
            table.querySelectorAll(`tbody tr`).forEach(tr => {
                const cell = tr.querySelector(`td:nth-child(${nth})`);
                if (cell) {
                    if (!colHasRT) cell.classList.add('rt-empty-col');
                    else cell.classList.remove('rt-empty-col');
                }
            });
        });
        // If user toggles modes later, CSS handles visibility; no further action needed here.
    }
    // Convert epoch seconds to formatted string compatible with formatTime display style
    formatEpoch(epochSeconds) {
        if (!epochSeconds) return null;
        return new Date(epochSeconds * 1000).toISOString();
    }

    formatDelay(delaySeconds) {
        if (delaySeconds === null || delaySeconds === undefined) return null;
        const sign = delaySeconds > 0 ? '+' : (delaySeconds < 0 ? '−' : '');
        const abs = Math.abs(delaySeconds);
        const mm = Math.floor(abs / 60);
        const ss = abs % 60;
        const body = mm ? `${mm}m${ss.toString().padStart(2,'0')}` : `${ss}s`;
        return { text: `${sign}${body}`, className: delaySeconds === 0 ? 'on-time' : (delaySeconds > 0 ? 'late' : 'early') };
    }

    formatTime(timeString) {
        if (!timeString) return { innerHTML: '', classList: '' };
        const d = new Date(timeString);
        const dateDisplay = d.toLocaleDateString('en-US', {
            year: 'numeric', month: 'numeric', day: 'numeric'
        });
        const timeDisplay = d.toLocaleTimeString('en-US', {
            hour: 'numeric', minute: '2-digit', hour12: true
        });
        const showDate = this.serviceDateDisplay && dateDisplay !== this.serviceDateDisplay;
        return {
            innerHTML: showDate ? `${dateDisplay}<br>${timeDisplay}` : timeDisplay,
            classList: showDate ? 'transit-day' : ''
        };
    }
    addHoverEffect() {
        const tables = document.querySelectorAll('.direction-table');
        tables.forEach((table) => {
            table.addEventListener('mouseover', function(event) {
                let cell = event.target;
                while (cell && cell.tagName !== 'TD' && cell.tagName !== 'TH') {
                    cell = cell.parentNode;
                }
                if (!cell) return;
                const row = cell.parentNode;
                const colIndex = Array.from(cell.parentNode.children).indexOf(cell);
                row.classList.add('highlight');
                Array.from(table.rows).forEach(row => {
                    if (row.cells[colIndex]) {
                        row.cells[colIndex].classList.add('highlight');
                    }
                });
            });

            table.addEventListener('mouseout', function(event) {
                let cell = event.target;
                while (cell && cell.tagName !== 'TD' && cell.tagName !== 'TH') {
                    cell = cell.parentNode;
                }
                if (!cell) return;
                const row = cell.parentNode;
                const colIndex = Array.from(cell.parentNode.children).indexOf(cell);
                row.classList.remove('highlight');
                Array.from(table.rows).forEach(row => {
                    if (row.cells[colIndex]) {
                        row.cells[colIndex].classList.remove('highlight');
                    }
                });
            });
        });
    }
    _renderTimeCell(td, tripObj, opts = {}) {
        // New unified renderer: shows time on first line, delay (if any) beneath
        // opts: { kind: 'arr' | 'dep' }
        const kind = opts.kind || 'dep';
        const sched = (kind === 'arr'
            ? (tripObj.arrival_time || tripObj.time)
            : (tripObj.departure_time || tripObj.time)) || '';
        const delaySec = kind === 'arr'
            ? (tripObj.arrival_delay ?? tripObj.delay ?? null)
            : (tripObj.departure_delay ?? tripObj.delay ?? null);

        td.classList.add('time-cell');

        const delayInfo = this._formatDelay(delaySec); // { text, className } | null

        td.innerHTML = `
            <div class="time-wrapper">
                <div class="time-value">${sched ? this._simplifyTime(sched) : ''}</div>
                <div class="delay-value ${delayInfo ? delayInfo.className : ''}">
                    ${delayInfo ? delayInfo.text : ''}
                </div>
            </div>
        `;
    }

    _formatDelay(delaySeconds) {
        if (delaySeconds === null || delaySeconds === undefined) return null;
        const cls = delaySeconds === 0
            ? 'ontime'
            : (delaySeconds > 0 ? 'late' : 'early');
        const mins = Math.round(Math.abs(delaySeconds) / 60);
        const sign = delaySeconds > 0 ? '+' : (delaySeconds < 0 ? '−' : '');
        return {
            text: `${sign}${mins}m`,
            className: cls
        };
    }

    _simplifyTime(val) {
        if (!val) return '';
        if (typeof val === 'number') {
            if (val < 86400) { // seconds since midnight
                const h = Math.floor(val / 3600);
                const m = Math.floor((val % 3600) / 60);
                return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
            }
            try { return new Date(val * 1000).toTimeString().slice(0,5); } catch { return ''; }
        }
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(val)) return val.slice(0,5);
        if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return val.substring(11,16);
        return val;
    }
}

export default TableManager;