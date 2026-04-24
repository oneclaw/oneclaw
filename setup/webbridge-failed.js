(function () {
  var hash = window.location.hash || "";
  if (hash.indexOf("#") === 0) hash = hash.slice(1);
  var params = new URLSearchParams(hash);
  var reason = params.get("reason") || "";
  if (reason) {
    var el = document.getElementById("wbfReason");
    if (el) el.textContent = reason;
  }
  function close() {
    if (window.oneclaw && window.oneclaw.closeWebbridgeFailedDialog) {
      window.oneclaw.closeWebbridgeFailedDialog();
    } else {
      window.close();
    }
  }
  var btnClose = document.getElementById("wbfClose");
  if (btnClose) btnClose.addEventListener("click", close);
  var btnOpen = document.getElementById("wbfOpen");
  if (btnOpen) {
    btnOpen.addEventListener("click", function () {
      if (window.oneclaw && window.oneclaw.openSettings) {
        window.oneclaw.openSettings();
      }
      close();
    });
  }
})();
