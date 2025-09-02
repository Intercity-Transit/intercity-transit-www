import IctBusUtils from './IctBusUtils.js';
import NavigationController from './navigation_controller.js';

// Instantiate the new TableManager, MapManager, and NavigationController
const navigationController = new NavigationController();
document.addEventListener('DOMContentLoaded', async function() {
    await navigationController.initialize();
    navigationController.setupEventHandlers();
    // Default to schedule view
    document.body.classList.add('schedule-mode');
    const scheduleButton = document.getElementById('scheduleButton');
    const realTimeButton = document.getElementById('realTimeButton');

    scheduleButton?.addEventListener('click', e => {
        e.preventDefault();
        scheduleButton.classList.add('active');
        realTimeButton?.classList.remove('active');
        navigationController.setViewMode('schedule');
    });

    realTimeButton?.addEventListener('click', e => {
        e.preventDefault();
        realTimeButton.classList.add('active');
        scheduleButton?.classList.remove('active');
        navigationController.setViewMode('realtime');
    });
});

// Update the map when show the map flyout when it is opened
document.getElementById('mapFlyout').addEventListener('shown.bs.offcanvas', function () {
    const routeId = $('#route_id').val();
    const directionId = $('#direction_toggle').val();
    // updateMap(routeId, directionId);
});

function toggleSection(section) {
    // Keep existing map / date logic, remove RT data fetch coupling
    const scheduleButton = document.getElementById('scheduleButton');
    const realTimeButton = document.getElementById('realTimeButton');
    const realTimeSection = document.getElementById('realTime');
    const dateInputWrapper = document.getElementById('date-input-wrapper');
    const displayDate = document.getElementById('formattedDate');
    const mapElement = document.getElementById('map');
    const realTimeMapElement = document.getElementById('realTimeMap');

    if (section === 'schedule') {
        scheduleButton.classList.add('active');
        realTimeButton.classList.remove('active');
        navigationController.setViewMode('schedule');
        realTimeSection.classList.add('d-none');
        dateInputWrapper.classList.remove('d-none');
        displayDate.classList.remove('d-none');
        mapElement.classList.remove('d-none');
        realTimeMapElement.classList.add('d-none');

        // Update div#formattedDate with the date from the dropdown in the format "Monday, January 13, 2025"
        const selectedDate = new Date($('#date').val() + 'T00:00:00');
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = selectedDate.toLocaleDateString('en-US', options);
        displayDate.innerText = formattedDate;
    } else {
        realTimeButton.classList.add('active');
        scheduleButton.classList.remove('active');
        navigationController.setViewMode('realtime');
        realTimeSection.classList.remove('d-none');
        dateInputWrapper.classList.add('d-none');
        displayDate.classList.add('d-none');
        map.classList.add('d-none');
        realTimeMap.classList.remove('d-none');

        // Show the current date inside the div#formattedDate in the format "Monday, January 14, 2025"
        const currentDate = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = currentDate.toLocaleDateString('en-US', options);
        displayDate.innerText = formattedDate;
    }
}
