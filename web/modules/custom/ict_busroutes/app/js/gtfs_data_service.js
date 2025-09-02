class GTFSDataService {
    constructor() {
        this.calendarData = {};
        this.routes = {};
        this.scheduleId = null;
        this.serviceIds = [];
        this.stopTimesData = {};
        this.realTimeData = {};
    }

    // Build query string, encoding service_ids[] as repeated params
    buildQuery(params = {}) {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            if (key === 'service_ids' && Array.isArray(value)) {
                value.forEach(v => qs.append('service_ids[]', v));
            } else {
                qs.append(key, value);
            }
        });
        return qs.toString();
    }

    /**
     * Fetches data from the given URL with the provided parameters.
     * @param {Object} params - { url: string, data: object }
     *   - url: API endpoint
     *   - data: parameters (e.g., date, route_id, schedule_id, service_ids, etc.)
     */
    async getData({ date, route_id, schedule_id, service_ids, direction_id, url = 'https://pics.intercitytransit.com/api/stop_times' }) {
        const data = {
            date,
            route_id,
            schedule_id,
            service_ids, // keep as array so it becomes service_ids[] in the query
            direction_id
        };
        return this.fetchFromAPI({ url, data });
    }
    async fetchFromAPI({ url, data }) {
        const isStopTimes = /\/stop_times\b/.test(url);
        const qs = this.buildQuery(data);
        const requestUrl = isStopTimes ? (qs ? `${url}?${qs}` : url) : url;

        console.log('Fetching data from:', requestUrl, 'with data:', isStopTimes ? '(GET query params)' : data);
        return new Promise((resolve, reject) => {
            $.ajax({
                type: isStopTimes ? 'GET' : 'POST',
                url: requestUrl,
                data: isStopTimes ? undefined : data, // keep POST for other endpoints (e.g., real_time)
                success: (response) => {
                    if (url.includes('stop_times') && response && response.data && response.data.Route) {
                        this.stopTimesData = response.data.Route;
                        resolve(response.data.Route);
                    } else if (url.includes('real_time') && response && response.Route) {
                        this.realTimeData = response.Route;
                        resolve(response.Route);
                    } else {
                        reject('No data found');
                    }
                },
                error: (error) => reject(error)
            });
        });
    }

    getStops(routeId, directionId) {
        // Example for static data
        return this.stopTimesData?.MapInfo?.Stops?.[directionId] || [];
    }

    getShapes(routeId, directionId) {
        // Example for static data
        return this.stopTimesData?.MapInfo?.Shapes?.[directionId] || [];
    }

    // Add similar methods for real-time data as needed
}

export default GTFSDataService;