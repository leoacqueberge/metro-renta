(() => {
  const PRICE = 2.05;
  const STORAGE_KEY = "metro-renta:v1";

  const els = {
    count: document.getElementById("ride-count"),
    total: document.getElementById("ride-total"),
    add: document.getElementById("btn-add"),
    undo: document.getElementById("btn-undo"),
    reset: document.getElementById("btn-reset"),
    hint: document.getElementById("hint"),
    dialog: document.getElementById("reset-dialog"),
    resetCancel: document.getElementById("btn-reset-cancel"),
    resetConfirm: document.getElementById("btn-reset-confirm"),
  };

  const euro = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let rides = 0;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data?.rides === "number" && data.rides >= 0) {
        rides = Math.floor(data.rides);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rides }));
  }

  function formatTotal(n) {
    return euro.format(n * PRICE).replace(/\u202f/g, "\u00a0");
  }

  function pulse(el, className) {
    el.classList.remove(className);
    // Force reflow so repeated taps retrigger the animation.
    void el.offsetWidth;
    el.classList.add(className);
  }

  function render({ animate } = { animate: null }) {
    els.count.textContent = String(rides);
    els.total.textContent = formatTotal(rides);

    const hasRides = rides > 0;
    els.undo.disabled = !hasRides;
    els.reset.disabled = !hasRides;

    if (animate === "add") {
      pulse(els.count, "is-bump");
      pulse(els.total, "is-bump");
      els.hint.textContent =
        rides === 1
          ? "1 trajet enregistré."
          : `${rides} trajets · ${formatTotal(rides)}`;
    } else if (animate === "undo") {
      pulse(els.count, "is-undo");
      pulse(els.total, "is-undo");
      els.hint.textContent = hasRides
        ? "Dernier trajet annulé."
        : "Compteur à zéro.";
    } else if (animate === "reset") {
      els.hint.textContent = "Compteur réinitialisé.";
    } else {
      els.hint.textContent = hasRides
        ? `${rides} trajet${rides > 1 ? "s" : ""} · ${formatTotal(rides)}`
        : "Appuyez pour enregistrer un trajet.";
    }
  }

  function addRide() {
    rides += 1;
    save();
    render({ animate: "add" });
  }

  function undoRide() {
    if (rides <= 0) return;
    rides -= 1;
    save();
    render({ animate: "undo" });
  }

  function openReset() {
    if (rides <= 0) return;
    els.dialog.hidden = false;
    els.resetConfirm.focus();
  }

  function closeReset() {
    els.dialog.hidden = true;
    els.reset.focus();
  }

  function confirmReset() {
    rides = 0;
    save();
    closeReset();
    render({ animate: "reset" });
  }

  els.add.addEventListener("click", addRide);
  els.undo.addEventListener("click", undoRide);
  els.reset.addEventListener("click", openReset);
  els.resetCancel.addEventListener("click", closeReset);
  els.resetConfirm.addEventListener("click", confirmReset);

  els.dialog.addEventListener("click", (event) => {
    if (event.target === els.dialog) closeReset();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.dialog.hidden) {
      closeReset();
    }
  });

  load();
  render();
})();
