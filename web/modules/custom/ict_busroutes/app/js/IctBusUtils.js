const IctBusUtils = (function() {
  'use strict';

  // Private methods and variables can go here

  // Public API
  return {
    showSpinner: function() {
      $("#ict-busroutes-app .loading-spinner").removeClass("d-none").addClass("d-flex");
    },

    hideSpinner: function() {
      $("#ict-busroutes-app .loading-spinner").removeClass("d-flex").addClass("d-none");
    }
  };
})();

// Export as default ES6 module
export default IctBusUtils;
