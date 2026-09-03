// ==========================================================================
// TALMA DATA CENTER — Selector de tema (claro / oscuro)
// Script independiente: solo maneja la apariencia visual (atributo
// data-theme + preferencia guardada). No interviene en la lógica de datos,
// conexión a Firebase, filtros ni CRUD de la aplicación.
// ==========================================================================
(function () {
  const STORAGE_KEY = "tdc-theme";
  const root = document.documentElement;

  function applyTheme(theme) {
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    const btn = document.getElementById("themeToggleBtn");
    if (btn) {
      const icon = btn.querySelector("i");
      if (icon) icon.className = theme === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
      btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    }
  }

  function getPreferredTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  const initial = getPreferredTheme();
  applyTheme(initial);

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(getPreferredTheme());
    const btn = document.getElementById("themeToggleBtn");
    if (btn) {
      btn.addEventListener("click", function () {
        const current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
        const next = current === "dark" ? "light" : "dark";
        localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
      });
    }
  });
})();
