(() => {
  const STORAGE_KEY = "metro-renta:v2";
  const DEVICE_KEY = "metro-renta:device-id";
  const DEFAULTS = {
    rides: 0,
    price: 2.05,
    milestoneInterval: 70,
  };

  const els = {
    count: document.getElementById("ride-count"),
    total: document.getElementById("ride-total"),
    add: document.getElementById("btn-add"),
    addPrice: document.getElementById("btn-add-price"),
    undo: document.getElementById("btn-undo"),
    settings: document.getElementById("btn-settings"),
    palier: document.getElementById("palier"),
    palierTarget: document.getElementById("palier-target"),
    palierFill: document.getElementById("palier-fill"),
    palierBar: document.getElementById("palier-bar"),
    palierMeta: document.getElementById("palier-meta"),
    settingsSheet: document.getElementById("settings-sheet"),
    inputPrice: document.getElementById("input-price"),
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
  let syncTimer = null;
  let toastTimer = null;

  function formatEuro(amount) {
    return euro.format(amount).replace(/\u202f/g, "\u00a0");
  }

  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `d-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data?.rides === "number" && data.rides >= 0) {
        state.rides = Math.floor(data.rides);
      }
      if (typeof data?.price === "number" && data.price > 0) {
        state.price = data.price;
      }
      if (typeof data?.milestoneInterval === "number" && data.milestoneInterval > 0) {
        state.milestoneInterval = data.milestoneInterval;
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
        price: state.price,
        milestoneInterval: state.milestoneInterval,
      })
    );
  }

  function initSupabase() {
    const cfg = window.METRO_RENTA_CONFIG || {};
    const url = (cfg.supabaseUrl || "").trim();
    const key = (cfg.supabaseAnonKey || "").trim();
    if (!url || !key || !window.supabase?.createClient) return;
    supabaseClient = window.supabase.createClient(url, key);
  }

  async function pullRemote() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from("metro_renta_state")
        .select("rides, price, milestone_interval, updated_at")
        .eq("device_id", deviceId())
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        await pushRemote();
        return;
      }

      state.rides = Math.max(0, Math.floor(Number(data.rides) || 0));
      state.price = Number(data.price) > 0 ? Number(data.price) : state.price;
      state.milestoneInterval =
        Number(data.milestone_interval) > 0
          ? Number(data.milestone_interval)
          : state.milestoneInterval;
      saveLocal();
      render();
    } catch (err) {
      console.warn("Supabase pull failed", err);
    }
  }

  async function pushRemote() {
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient.from("metro_renta_state").upsert(
        {
          device_id: deviceId(),
          rides: state.rides,
          price: state.price,
          milestone_interval: state.milestoneInterval,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "device_id" }
      );
      if (error) throw error;
    } catch (err) {
      console.warn("Supabase push failed", err);
    }
  }

  function scheduleSync() {
    saveLocal();
    if (!supabaseClient) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      pushRemote();
    }, 280);
  }

  function totalAmount() {
    return state.rides * state.price;
  }

  function milestoneInfo() {
    const interval = state.milestoneInterval;
    const total = totalAmount();
    if (!(interval > 0)) {
      return { level: 0, target: 0, progress: 0, remaining: 0, reached: false };
    }
    const level = Math.floor(total / interval);
    const into = total - level * interval;
    const remaining = Math.max(0, interval - into);
    const progress = Math.min(100, (into / interval) * 100);
    const target = (level + 1) * interval;
    const reached = total > 0 && into === 0;
    return { level, target, progress: reached ? 100 : progress, remaining: reached ? 0 : remaining, reached };
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

  function render({ animate } = {}) {
    const total = totalAmount();
    const m = milestoneInfo();

    els.count.textContent = String(state.rides);
    els.total.textContent = formatEuro(total);
    els.addPrice.textContent = formatEuro(state.price);

    els.palierTarget.textContent = formatEuro(m.target || state.milestoneInterval);
    els.palierFill.style.width = `${m.progress}%`;
    els.palierBar.setAttribute("aria-valuenow", String(Math.round(m.progress)));
    els.palier.classList.toggle("is-reached", m.reached);

    if (m.reached && state.rides > 0) {
      els.palierMeta.textContent = `Palier ${m.level} atteint · prochain ${formatEuro(m.target)}`;
    } else {
      els.palierMeta.textContent = `${formatEuro(m.remaining)} restants · palier ${m.level}`;
    }

    const hasRides = state.rides > 0;
    els.undo.disabled = !hasRides;
    els.reset.disabled = !hasRides;

    if (animate === "add") {
      pulse(els.count, "is-bump");
      pulse(els.total, "is-bump");
      if (m.reached) showToast(`Palier ${m.level} · ${formatEuro(total)}`);
    } else if (animate === "undo") {
      pulse(els.count, "is-undo");
      pulse(els.total, "is-undo");
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

  function openSettings() {
    els.inputPrice.value = String(state.price);
    els.inputMilestone.value = String(state.milestoneInterval);
    els.settingsSheet.hidden = false;
  }

  function closeSettings() {
    els.settingsSheet.hidden = true;
  }

  function saveSettings() {
    const price = Number(String(els.inputPrice.value).replace(",", "."));
    const milestone = Number(String(els.inputMilestone.value).replace(",", "."));
    if (!(price > 0) || !(milestone > 0)) {
      showToast("Valeurs invalides");
      return;
    }
    state.price = Math.round(price * 100) / 100;
    state.milestoneInterval = Math.round(milestone * 100) / 100;
    scheduleSync();
    closeSettings();
    render();
    showToast("Réglages enregistrés");
  }

  function openReset() {
    if (state.rides <= 0) return;
    els.resetDialog.hidden = false;
  }

  function closeReset() {
    els.resetDialog.hidden = true;
  }

  function confirmReset() {
    state.rides = 0;
    scheduleSync();
    closeReset();
    closeSettings();
    render({ animate: "reset" });
    showToast("Compteur réinitialisé");
  }

  els.add.addEventListener("click", addRide);
  els.undo.addEventListener("click", undoRide);
  els.settings.addEventListener("click", openSettings);
  els.settingsClose.addEventListener("click", closeSettings);
  els.settingsSave.addEventListener("click", saveSettings);
  els.reset.addEventListener("click", openReset);
  els.resetCancel.addEventListener("click", closeReset);
  els.resetConfirm.addEventListener("click", confirmReset);

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

  loadLocal();
  initSupabase();
  render();
  pullRemote();
})();
