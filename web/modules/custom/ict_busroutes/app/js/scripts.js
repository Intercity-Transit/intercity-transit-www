

$("#ict-busroutes-app").ready(function () {
  // With the element initially hidden, we can show it slowly:
  // Show spinner
  // IctBustimeApp.showSpinner();

  // Hide spinner using the new object method
  IctBusUtils.hideSpinner();
  console.log("Bus routes app is ready.");
});
