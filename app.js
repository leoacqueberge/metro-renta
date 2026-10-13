(() => {
  const STORAGE_KEY = "metro-renta:v3";
  const PRICE_STANDARD = 2.55;
  const PRICE_LIBERTE = 2.05;
  const DEFAULTS = {
    rides: 0,
    fines: 0,
    passLiberte: false,
    price: PRICE_STANDARD,
    fineAmount: 70,
  };

  const els = {
    count: document.getElementById("ride-count"),
    total: document.getElementById("ride-total"),
    renta: document.getElementById("renta-value"),
    amendes: document.getElementById("amende-count"),
    amendeRate: document.getElementById("amende-rate"),
    fineMinus: document.getElementById("btn-fine-minus"),
    finePlus: document.getElementById("btn-fine-plus"),
    add: document.getElementById("btn-add"),
    addPrice: document.getElementById("btn-add-price"),
    addPass: document.getElementById("btn-add-pass"),
    undo: document.getElementById("btn-undo"),
    settings: document.getElementById("btn-settings"),
    palier: document.getElementById("palier"),
    palierTarget: document.getElementById("palier-target"),
    palierFill: document.getElementById("palier-fill"),
    palierBar: document.getElementById("palier-bar"),
    palierMeta: document.getElementById("palier-meta"),
    settingsSheet: document.getElementById("settings-sheet"),
    settingsPrice: document.getElementById("settings-price"),
    inputPassLiberte: document.getElementById("input-pass-liberte"),
    inputMilestone: document.getElementById("input-milestone"),
    settingsClose: document.getElementById("btn-settings-close"),
    settingsSave: document.getElementById("btn-settings-save"),
    reset: document.getElementById("btn-reset"),
    resetDialog: document.getElementById("reset-dialog"),
    resetCancel: document.getElementById("btn-reset-cancel"),
    resetConfirm: document.getElementById("btn-reset-confirm"),
    toast: document.getElementById("toast"),
  };

  const euro = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  let state = { ...DEFAULTS };
  let supabaseClient = null;
  let ownerKey = "default";
  let syncTimer = null;
  let toastTimer = null;
  let cloudReady = false;

  function formatEuro(amount) {
    return euro.format(amount).replace(/\u202f/g, "\u00a0");
  }

  function priceFromPass(passLiberte) {
    return passLiberte ? PRICE_LIBERTE : PRICE_STANDARD;
  }

  function applyPassLiberte(passLiberte) {
    state.passLiberte = Boolean(passLiberte);
    state.price = priceFromPass(state.passLiberte);
  }

  function migrateLegacyLocal(data) {
    if (typeof data?.fines === "number" && data.fines >= 0) {
      state.fines = Math.floor(data.fines);
    }
    if (typeof data?.fineAmount === "number" && data.fineAmount > 0) {
      state.fineAmount = data.fineAmount;
    } else if (typeof data?.milestoneInterval === "number" && data.milestoneInterval > 0) {
      state.fineAmount = data.milestoneInterval;
    }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("metro-renta:v2");
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data?.rides === "number" && data.rides >= 0) {
        state.rides = Math.floor(data.rides);
      }
      migrateLegacyLocal(data);

      if (typeof data?.passLiberte === "boolean") {
        applyPassLiberte(data.passLiberte);
      } else if (typeof data?.price === "number" && data.price > 0) {
        applyPassLiberte(Math.abs(data.price - PRICE_LIBERTE) < 0.001);
      }
    } catch {
      /* ignore */
    }
  }

  function saveLocal() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        rides: state.rides,
        fines: state.fines,
        passLiberte: state.passLiberte,
        price: state.price,
        fineAmount: state.fineAmount,
      })
    );
  }

  function initSupabase() {
    const cfg = window.METRO_RENTA_CONFIG || {};
    const url = (cfg.supabaseUrl || "").trim();
    const key = (cfg.supabaseAnonKey || "").trim();
    ownerKey = (cfg.ownerKey || "default").trim() || "default";
    if (!url || !key || !window.supabase?.createClient) return false;
    supabaseClient = window.supabase.createClient(url, key);
    return true;
  }

  async function pullRemote() {
    if (!supabaseClient) return false;
    const { data, error } = await supabaseClient
      .from("metro_renta_state")
      .select("rides, fines, price, milestone_interval, updated_at")
      .eq("device_id", ownerKey)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      await pushRemote();
      return true;
    }

    state.rides = Math.max(0, Math.floor(Number(data.rides) || 0));
    state.fines = Math.max(0, Math.floor(Number(data.fines) || 0));
    const remotePrice = Number(data.price);
    applyPassLiberte(remotePrice > 0 && Math.abs(remotePrice - PRICE_LIBERTE) < 0.001);
    state.fineAmount =
      Number(data.milestone_interval) > 0
        ? Number(data.milestone_interval)
        : DEFAULTS.fineAmount;
    saveLocal();
    return true;
  }

  async function pushRemote() {
    if (!supabaseClient) return false;
    const { error } = await supabaseClient.from("metro_renta_state").upsert(
      {
        device_id: ownerKey,
        rides: state.rides,
        fines: state.fines,
        price: state.price,
        milestone_interval: state.fineAmount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" }
    );
    if (error) throw error;
    return true;
  }

  function scheduleSync() {
    saveLocal();
    if (!supabaseClient || !cloudReady) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try {
        await pushRemote();
      } catch (err) {
        console.warn("Supabase push failed", err);
        showToast("Sync cloud impossible");
      }
    }, 220);
  }

  function totalAmount() {
    return state.rides * state.price;
  }

  function finesCost() {
    return state.fines * state.fineAmount;
  }

  function rentability() {
    return totalAmount() - finesCost();
  }

  function thresholdInfo() {
    const interval = state.fineAmount;
    const total = totalAmount();
    if (!(interval > 0)) {
      return { level: 0, progress: 0, remaining: 0, reached: false };
    }
    const level = Math.floor(total / interval);
    const into = total - level * interval;
    const remaining = Math.max(0, interval - into);
    const progress = Math.min(100, (into / interval) * 100);
    const reached = total > 0 && into === 0;
    return {
      level,
      progress: reached ? 100 : progress,
      remaining: reached ? 0 : remaining,
      reached,
    };
  }

  function pulse(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function showToast(message) {
    els.toast.hidden = false;
    els.toast.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.hidden = true;
    }, 2200);
  }

  function syncSettingsPricePreview() {
    const pass = els.inputPassLiberte.checked;
    els.settingsPrice.textContent = formatEuro(priceFromPass(pass));
  }

  function render({ animate } = {}) {
    const total = totalAmount();
    const net = rentability();
    const m = thresholdInfo();
    const covered = Math.floor(total / state.fineAmount);

    els.count.textContent = String(state.rides);
    els.total.textContent = formatEuro(total);
    els.renta.textContent = formatEuro(net);
    els.renta.classList.toggle("is-positive", net > 0);
    els.renta.classList.toggle("is-negative", net < 0);
    els.amendes.textContent = String(state.fines);
    els.amendeRate.textContent = `${formatEuro(state.fineAmount)} l'amende`;
    els.addPrice.textContent = formatEuro(state.price);
    els.addPass.hidden = !state.passLiberte;

    els.palierTarget.textContent = formatEuro(state.fineAmount);
    els.palierFill.style.width = `${m.progress}%`;
    els.palierBar.setAttribute("aria-valuenow", String(Math.round(m.progress)));
    els.palier.classList.toggle("is-reached", m.reached);

    if (m.reached && state.rides > 0) {
      const label = covered > 1 ? "amendes" : "amende";
      els.palierMeta.textContent = `Seuil atteint · ${covered} ${label} absorbable${covered > 1 ? "s" : ""}`;
    } else {
      els.palierMeta.textContent = `${formatEuro(m.remaining)} avant le prochain seuil`;
    }

    const hasRides = state.rides > 0;
    const hasFines = state.fines > 0;
    els.undo.disabled = !hasRides;
    els.fineMinus.disabled = !hasFines;
    els.reset.disabled = !hasRides && !hasFines;

    if (animate === "add") {
      pulse(els.count, "is-bump");
      pulse(els.total, "is-bump");
      pulse(els.renta, "is-bump");
      if (m.reached) {
        showToast(`Seuil · ${formatEuro(total)} économisés`);
      }
    } else if (animate === "undo") {
      pulse(els.count, "is-undo");
      pulse(els.total, "is-undo");
      pulse(els.renta, "is-undo");
    } else if (animate === "fine-add") {
      pulse(els.amendes, "is-bump");
      pulse(els.renta, "is-bump");
      showToast(`Amende ajoutée · ${formatEuro(net)}`);
    } else if (animate === "fine-undo") {
      pulse(els.amendes, "is-undo");
      pulse(els.renta, "is-undo");
    }
  }

  function addRide() {
    state.rides += 1;
    scheduleSync();
    render({ animate: "add" });
  }

  function undoRide() {
    if (state.rides <= 0) return;
    state.rides -= 1;
    scheduleSync();
    render({ animate: "undo" });
  }

  function addFine() {
    state.fines += 1;
    scheduleSync();
    render({ animate: "fine-add" });
  }

  function undoFine() {
    if (state.fines <= 0) return;
    state.fines -= 1;
    scheduleSync();
    render({ animate: "fine-undo" });
  }

  function openSettings() {
    els.inputPassLiberte.checked = state.passLiberte;
    els.inputMilestone.value = String(state.fineAmount);
    syncSettingsPricePreview();
    els.settingsSheet.hidden = false;
  }

  function closeSettings() {
    els.settingsSheet.hidden = true;
  }

  function saveSettings() {
    const fineAmount = Number(String(els.inputMilestone.value).replace(",", "."));
    if (!(fineAmount > 0)) {
      showToast("Valeurs invalides");
      return;
    }
    applyPassLiberte(els.inputPassLiberte.checked);
    state.fineAmount = Math.round(fineAmount * 100) / 100;
    scheduleSync();
    closeSettings();
    render();
    showToast("Réglages enregistrés");
  }

  function openReset() {
    if (state.rides <= 0 && state.fines <= 0) return;
    els.resetDialog.hidden = false;
  }

  function closeReset() {
    els.resetDialog.hidden = true;
  }

  function confirmReset() {
    state.rides = 0;
    state.fines = 0;
    scheduleSync();
    closeReset();
    closeSettings();
    render({ animate: "reset" });
    showToast("Compteur réinitialisé");
  }

  els.add.addEventListener("click", addRide);
  els.undo.addEventListener("click", undoRide);
  els.finePlus.addEventListener("click", addFine);
  els.fineMinus.addEventListener("click", undoFine);
  els.settings.addEventListener("click", openSettings);
  els.settingsClose.addEventListener("click", closeSettings);
  els.settingsSave.addEventListener("click", saveSettings);
  els.reset.addEventListener("click", openReset);
  els.resetCancel.addEventListener("click", closeReset);
  els.resetConfirm.addEventListener("click", confirmReset);
  els.inputPassLiberte.addEventListener("change", syncSettingsPricePreview);

  els.settingsSheet.addEventListener("click", (event) => {
    if (event.target === els.settingsSheet) closeSettings();
  });
  els.resetDialog.addEventListener("click", (event) => {
    if (event.target === els.resetDialog) closeReset();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.resetDialog.hidden) closeReset();
    else if (!els.settingsSheet.hidden) closeSettings();
  });

  async function boot() {
    loadLocal();
    render();

    const configured = initSupabase();
    if (!configured) return;

    try {
      await pullRemote();
      cloudReady = true;
      render();
    } catch (err) {
      console.warn("Supabase pull failed", err);
      showToast("Cloud indisponible · cache local");
    }
  }

  boot();
})();
