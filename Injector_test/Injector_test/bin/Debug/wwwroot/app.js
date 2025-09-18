// Injector Test Bench UI (with Save result button)
// Offline; expects Chart.js UMD at ./lib/chart.umd.min.js
(() => {
  const $ = sel => document.querySelector(sel);
  const dateStr = $("#dateStr");
  const timeStr = $("#timeStr");
  const pressureVal = $("#pressureVal");
  const flowVal = $("#flowVal");
  const testStatus = $("#testStatus");
  const feedPump = $("#feedPump");
  const drainPump = $("#drainPump");
  const usbStatus = $("#usbStatus");
  const appVersion = $("#appVersion");

  const btnStart = $("#btnStart");
  const btnStop = $("#btnStop");
  const btnSave = $("#btnSave");

  const serialInput = $("#serialInput");
  const clearSerial = $("#clearSerial");

  // Keyboard selectors
  const osk = $("#osk");
  const oskPanel = $("#oskPanel");
  const oskEnter = $("#oskEnter");
  const oskBackspace = $("#oskBackspace");
  const oskClear = $("#oskClear");
  const oskUnderscore = $("#oskUnderscore");
  const oskDash = $("#oskDash");
  const oskSpace = $("#oskSpace");

  let cfg = {
    pressureAxis: { min: 0, max: 200 },
    flowAxis: { min: 0, max: 10 }
  };

  const VERSION_ENDPOINT = "/api/version";
  const USB_ENDPOINT = "/api/usb";

  // ===== Date/Time =====
  function updateClock() {
    const now = new Date();
    const d = now.toLocaleDateString('ru-RU', { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' });
    const t = now.toLocaleTimeString('ru-RU', { hour12: false });
    dateStr.textContent = d;
    timeStr.textContent = t;
  }
  updateClock();
  setInterval(updateClock, 1000);

  // ===== On-screen keyboard (grid has only A-Z and 0-9) =====
  const keys = [
    ..."1234567890",
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  ];
  function buildOSK() {
    if (!osk) return;
    osk.innerHTML = "";
    keys.forEach(k => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = k;
      b.addEventListener("click", () => {
        serialInput.value += k;
        serialInput.dispatchEvent(new Event('input'));
        serialInput.focus();
        serialInput.setSelectionRange(serialInput.value.length, serialInput.value.length);
      });
      osk.appendChild(b);
    });
  }
  function showOSK() {
    oskPanel.classList.remove('hidden');
    oskPanel.classList.add('show');
    oskPanel.setAttribute('aria-hidden', 'false');
  }
  function hideOSK() {
    oskPanel.classList.remove('show');
    oskPanel.setAttribute('aria-hidden', 'true');
    oskPanel.classList.add('hidden');
  }
  serialInput.addEventListener("focus", () => showOSK());
  document.addEventListener('click', (e) => {
    const within = e.target.closest('.serial-block');
    const withinPanel = e.target.closest('#oskPanel');
    if (!within && !withinPanel) hideOSK();
  });
  oskEnter.addEventListener('click', hideOSK);
  oskBackspace.addEventListener('click', () => {
    serialInput.value = serialInput.value.slice(0, -1);
    serialInput.dispatchEvent(new Event('input'));
    serialInput.focus();
  });
  oskClear.addEventListener('click', () => {
    serialInput.value = '';
    serialInput.dispatchEvent(new Event('input'));
    serialInput.focus();
  });
  oskUnderscore.addEventListener('click', () => {
    serialInput.value += '_';
    serialInput.dispatchEvent(new Event('input'));
    serialInput.focus();
  });
  oskDash.addEventListener('click', () => {
    serialInput.value += '-';
    serialInput.dispatchEvent(new Event('input'));
    serialInput.focus();
  });
  oskSpace.addEventListener('click', () => {
    serialInput.value += ' ';
    serialInput.dispatchEvent(new Event('input'));
    serialInput.focus();
  });
  serialInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') hideOSK(); });
  clearSerial.addEventListener("click", () => { serialInput.value=''; serialInput.dispatchEvent(new Event('input')); });

  // ===== Status handling =====
  const setBadge = (el, stateMap) => { el.className = `badge ${stateMap.class}`; el.textContent = stateMap.label; };
  const STATUS = { IDLE:{class:'idle',label:'IDLE'}, PREP:{class:'prepare',label:'Prepare'}, RUN:{class:'run',label:'Run'}, FIN:{class:'finished',label:'Finished'} };
  const PUMP = { ON:{class:'on',label:'ON'}, OFF:{class:'off',label:'OFF'} };

  let state = {
    status: "IDLE",
    feed: "OFF",
    drain: "OFF",
    pressure: null,
    flow: null,
    data: { labels: [], pressure: [], flow: [] }
  };

  function applyState() {
    setBadge(testStatus, STATUS[state.status]);
    setBadge(feedPump, PUMP[state.feed]);
    setBadge(drainPump, PUMP[state.drain]);
    pressureVal.textContent = state.pressure == null ? "--" : state.pressure.toFixed(1);
    flowVal.textContent = state.flow == null ? "--" : state.flow.toFixed(2);

    const showCharts = state.status === "FIN" && state.data.labels.length > 0;
    document.getElementById("pressureChartEmpty").style.display = showCharts ? "none" : "grid";
    document.getElementById("flowChartEmpty").style.display = showCharts ? "none" : "grid";
    if (showCharts) drawCharts();

    if (btnSave) btnSave.disabled = !showCharts;
  }

  // ===== Config =====
  async function loadConfig() {
    try {
      const res = await fetch("config.json", { cache: "no-store" });
      if (res.ok) { const j = await res.json(); cfg = { ...cfg, ...j }; }
    } catch (_) { /* keep defaults */ }
  }

  // ===== Version & USB =====
  async function fetchVersion() {
    try { const r = await fetch(VERSION_ENDPOINT, { cache: 'no-store' }); if (r.ok) appVersion.textContent = (await r.text()).trim(); else throw 0; }
    catch (_) { appVersion.textContent = "local-dev"; }
  }
  async function pollUSB() {
    try { const r = await fetch(USB_ENDPOINT, { cache: 'no-store' }); const j = r.ok ? await r.json() : {}; setUSB(j.connected === true ? 'connected' : 'disconnected'); }
    catch (_) { setUSB('unknown'); }
  }
  function setUSB(state) { usbStatus.className = `dot ${state}`; usbStatus.textContent = state.toUpperCase(); }

  // ===== Charts =====
  let pressureChart, flowChart;
  function drawCharts() {
    if (!window.Chart) { console.error("Chart.js not found."); return; }
    if (pressureChart) pressureChart.destroy();
    if (flowChart) flowChart.destroy();
    const pctx = document.getElementById('pressureChart').getContext('2d');
    const fctx = document.getElementById('flowChart').getContext('2d');

    pressureChart = new Chart(pctx, {
      type: 'line',
      data: { labels: state.data.labels, datasets: [{ label: 'Давление (bar)', data: state.data.pressure, tension: 0.25, fill: false, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 't, с' } }, y: { min: cfg.pressureAxis.min, max: cfg.pressureAxis.max, title: { display: true, text: 'bar' } } }, plugins: { legend: { display: false } } }
    });

    flowChart = new Chart(fctx, {
      type: 'line',
      data: { labels: state.data.labels, datasets: [{ label: 'Расход (л/мин)', data: state.data.flow, tension: 0.25, fill: false, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 't, с' } }, y: { min: cfg.flowAxis.min, max: cfg.flowAxis.max, title: { display: true, text: 'л/мин' } } }, plugins: { legend: { display: false } } }
    });
  }

  // ===== Demo live & finish =====
  function simulateLiveValues() {
    if (state.status === "RUN") {
      const t = Date.now() / 1000;
      state.pressure = 50 + 20 * Math.sin(t * 0.8);
      state.flow = 2 + 0.8 * Math.sin(t * 1.2 + 1);
      applyState();
    }
  }
  setInterval(simulateLiveValues, 200);
  function simulateFinishedData() {
    const N = 300;
    const labels = Array.from({length: N}, (_, i) => (i * 0.2).toFixed(1));
    const pressure = labels.map((_, i) => 20 + 40 * Math.exp(-i/120) + 10 * Math.sin(i/7));
    const flow = labels.map((_, i) => 1.5 + 1.2 * Math.sin(i/13) + 0.2 * Math.random());
    state.data = { labels, pressure, flow };
  }

  // ===== Save result =====
  function download(filename, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  function buildPayload() {
    return {
      timestamp: new Date().toISOString(),
      serial: serialInput.value || null,
      status: state.status,
      pumps: { feed: state.feed, drain: state.drain },
      axes: { pressure: cfg.pressureAxis, flow: cfg.flowAxis },
      data: state.data
    };
  }
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const payload = buildPayload();
      const serialSafe = (payload.serial || 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const fname = `injector_result_${serialSafe}_${ts}.json`;
      download(fname, JSON.stringify(payload, null, 2));
    });
  }

  // External API
  window.InjectorUI = {
    setStatus(s) { if (STATUS[s]) { state.status = s; applyState(); } },
    setPumps(feedOn, drainOn) { state.feed = feedOn ? "ON" : "OFF"; state.drain = drainOn ? "ON" : "OFF"; applyState(); },
    setLive(pressure, flow) { state.pressure = pressure; state.flow = flow; applyState(); },
    setCharts(labels, pressureArr, flowArr) { state.data = { labels, pressure: pressureArr, flow: flowArr }; applyState(); }
  };

  // Buttons
  btnStart.addEventListener("click", () => {
    if (!serialInput.value.trim()) { alert("Введите серийный номер инжектора."); return; }
    state.status = "PREP"; state.feed = "ON"; state.drain = "ON"; state.data = { labels: [], pressure: [], flow: [] }; applyState();
    setTimeout(() => { state.status = "RUN"; applyState(); }, 1200);
    setTimeout(() => { state.status = "FIN"; state.feed = "OFF"; state.drain = "OFF"; simulateFinishedData(); applyState(); }, 8000);
  });
  btnStop.addEventListener("click", () => { state.status = "IDLE"; state.feed = "OFF"; state.drain = "OFF"; applyState(); });

  // Init
  (async () => {
    buildOSK();
    try { await fetchVersion(); } catch(_) {}
    try { await loadConfig(); } catch(_) {}
    try { await pollUSB(); } catch(_) {}
    setInterval(pollUSB, 5000);
    applyState();
  })();
})();
