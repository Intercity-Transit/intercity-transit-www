/**
 * Handles UI logic for navigation/calendar, routes, and directions.
 * Coordinates with NavigationDataService for data.
 */
class NavigationUIManager {
    /**
     * @param {NavigationDataService} dataService - Service for fetching/storing navigation data.
     */
    constructor(dataService) {
        this.data = dataService;
    }

    /**
     * Initializes the navigation UI: date picker, routes, directions.
     * @param {Object} data - Object to store selected navigation/service IDs.
     */
    async initialize() {
        try {
            const displayDateInput = document.getElementById('display_date');
            const dateInput = document.getElementById('date');
            const availableDates = Object.keys(this.data.calendarData.dates);
            const currentDate = new Date();
            const self = this; // Capture the class instance

            $(displayDateInput).datepicker({
                beforeShowDay: (date) => {
                    const dateString = $.datepicker.formatDate('yy-mm-dd', date);
                    return [availableDates.includes(dateString)];
                },
                dateFormat: 'mm/dd/yy',
                altFormat: 'yy-mm-dd',
                altField: dateInput,
                onSelect: function(dateText) {
                    const selectedDate = $.datepicker.formatDate('yy-mm-dd', $(displayDateInput).datepicker('getDate'));
                    const dateData = self.data.calendarData.dates[selectedDate];
                    if (dateData) {
                        self.scheduleId = dateData.schedule_id;
                        self.serviceIds = dateData.service_ids;
                    }
                    self.renderRouteOptions(self.scheduleId);
                    self.renderDirectionOptions(self.scheduleId, $('#route_id').val());
                    if (typeof fetchStopTimes === 'function') fetchStopTimes();
                    if (typeof fetchRealTimeData === 'function') fetchRealTimeData();
                    $(displayDateInput).datepicker('hide');
                    // --- Trigger the change event on the hidden input so the controller can react ---
                    $('#date').val(selectedDate).trigger('change');
                }
            }).datepicker('setDate', currentDate);

            const initialDateData = this.data.calendarData.dates[$.datepicker.formatDate('yy-mm-dd', currentDate)];
            this.scheduleId = initialDateData.schedule_id;
            this.serviceIds = initialDateData.service_ids;
            this.renderRouteOptions(this.scheduleId);
            this.renderDirectionOptions(this.scheduleId, $('#route_id').val());
            console.log('Navigation UI initialized with schedule ID:', this.scheduleId, 'and service IDs:', this.serviceIds, 'for date:', initialDateData.date, 'route:', $('#route_id').val(), 'direction:', $('#direction_toggle').val());
        } catch (error) {
            console.error('Error initializing navigation UI:', error);
        }
}

    /**
     * Renders route options in the route dropdown for a given schedule.
     * @param {string} scheduleId
     */
    renderRouteOptions(scheduleId) {
        const routeIdDropdown = document.getElementById('route_id');
        routeIdDropdown.innerHTML = '';
        for (const routeId in this.data.routes) {
            if (this.data.routes[routeId].schedules[scheduleId]) {
                const option = document.createElement('option');
                option.value = routeId;
                option.textContent = this.data.routes[routeId].route_short_name;
                routeIdDropdown.appendChild(option);
            }
        }
    }

    /**
     * Renders direction options in the direction toggle for a given schedule and route.
     * @param {string} scheduleId
     * @param {string} routeId
     */
    renderDirectionOptions(scheduleId, routeId) {
        const directionToggle = document.getElementById('direction_toggle');
        directionToggle.innerHTML = '';
        if (this.data.routes[routeId] && this.data.routes[routeId].schedules[scheduleId]) {
            const directions = this.data.routes[routeId].schedules[scheduleId].directions;
            for (const directionId in directions) {
                const directionName = directions[directionId];
                const option = document.createElement('option');
                option.value = directionId;
                option.textContent = directionName;
                directionToggle.appendChild(option);
            }
        }
    }

    /**
     * Updates the UI to show the selected direction's tables and map.
     * @param {string} scheduleId
     */
    updateDirectionView(scheduleId) {
        const routes = this.data.routes;
        const selectedDirectionId = $('#direction_toggle').val();
        $('.direction-table-wrapper').each(function() {
            if (this.dataset.directionId === selectedDirectionId) {
                $(this).fadeIn(400, 'swing');
            } else {
                $(this).fadeOut(400, 'swing');
            }
        });
        $('.real-time-table-wrapper').each(function() {
            if (this.dataset.directionId === selectedDirectionId) {
                $(this).fadeIn(400, 'swing');
            } else {
                $(this).fadeOut(400, 'swing');
            }
        });
        const routeId = $('#route_id').val();
        const date = $('#date').val();
        const adjustedDate = new Date(date);
        adjustedDate.setMinutes(adjustedDate.getMinutes() + adjustedDate.getTimezoneOffset());
        if (routes && routes[routeId] && routes[routeId].schedules[scheduleId]) {
            const directions = routes[routeId].schedules[scheduleId].directions;
            if (directions[selectedDirectionId]) {
                $('#tripHeadsign').text(`${directions[selectedDirectionId] || ''} `);
                if (typeof window.updateMap === 'function') {
                    window.updateMap(routeId, selectedDirectionId);
                }
            }
        }
    }

    /**
     * Displays a modal when no results are found for the selected route/date.
     */
    displayNoResultsModal() {
        const displayDate = document.getElementById('display_date').value;
        const formattedDate = displayDate ? new Date(displayDate).toLocaleDateString() : 'the selected date';
        $('#noResultsModal .modal-body p').text(`The selected route does not operate on ${formattedDate}.`);
        $('#noResultsModal').modal('show');
    }
}

export default NavigationUIManager;
