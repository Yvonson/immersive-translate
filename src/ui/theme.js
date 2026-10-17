"use strict";
(() => {
  const system = matchMedia("(prefers-color-scheme: dark)");
  function apply() {
    const mode = twpConfig.get("darkMode");
    document.documentElement.dataset.theme = mode === "yes" || (mode === "auto" && system.matches) ? "dark" : "light";
  }
  twpConfig.onReady(apply);
  twpConfig.onChanged(name => { if (name === "darkMode") apply(); });
  system.addEventListener("change",apply);
})();
