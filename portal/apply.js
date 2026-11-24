"use strict";
const dialog = document.getElementById("access-application");
document.getElementById("open-application").addEventListener("click", event => {
  if (typeof dialog.showModal !== "function") return;
  event.preventDefault();
  dialog.showModal();
});
