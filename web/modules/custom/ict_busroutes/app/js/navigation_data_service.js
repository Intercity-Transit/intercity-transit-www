/**
 * Service for fetching and storing navigation/calendar data.
 */
class NavigationDataService {
    constructor() {
        this.calendarData = {};
        this.routes = {};
    }

    /**
     * Loads calendar data from the API.
     * @returns {Promise<Object>}
     */
    async load(endpoint = 'https://pics.intercitytransit.com/api/calendar_dates') {
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        if (data.dates && typeof data.dates === 'object' && data.routes && typeof data.routes === 'object') {
            this.calendarData = data;
            this.routes = data.routes;
            return data;
        } else {
            throw new Error('Data is not in the expected format');
        }
    }
}

export default NavigationDataService;