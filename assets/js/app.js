import { CONFIG, FALLBACK_VARIABLES, PERIODS } from "./config.js";
import { DataService, numericValue, timestamp } from "./data-service.js";
import { scheduleChart, statistics } from "./charts.js";
import { downloadSelection } from "./downloads.js";

const service = new DataService(CONFIG);
const state = {
  stationCode: CONFIG.defaultStation,
  variableKey: CONFIG.defaultVariable,
  period: CONFIG.defaultPeriod,
  manifest: null,
  variables: FALLBACK_VARIABLES,
  currentRows: [],
  currentPoints: [],
  requestId: 0,
};

const elements = {
  headerStatus: document.querySelector("#header-status"),
  networkNumber: document.querySelector("#network-number"),
  networkUpdated: document.querySelector("#network-updated"),
  stationGrid: document.querySelector("#station-grid"),
  stationSelect: document.querySelector("#station-select"),
  variableSelect: document.querySelector("#variable-select"),
  periodGrid: document.querySelector("#period-grid"),
  availability: document.querySelector("#data-availability"),
  chartStation: document.querySelector("#chart-station"),
  chartTitle: document.querySelector("#chart-title"),
  chartState: document.querySelector("#chart-state"),
  chartCanvas: document.querySelector("#history-chart"),
  chartEmpty: document.querySelector("#chart-empty"),
  statMin: document.querySelector("#stat-min"),
  statAvg: document.querySelector("#stat-avg"),
  statMax: document.querySelector("#stat-max"),
  statCount: document.querySelector("#stat-count"),
  downloadTrigger: document.querySelector("#download-trigger"),
  downloadDialog: document.querySelector("#download-dialog"),
  confirmDownload: document.querySelector("#confirm-download"),
};

function formatDate(value, includeTime = true) {
  if (!value || !timestamp(value)) return "Sin datos";
  return new Date(value).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function formatMetric(entry, variableKey) {
  if (!entry) return "—";
  const variable = state.variables[variableKey];
  if (variableKey === "relay") return entry.value === 1 ? "Encendido" : "Apagado";
  return `${entry.value.toFixed(variable.decimals)} ${variable.unit}`;
}

function stationByCode(code) {
  return state.manifest.stations.find((station) => station.code === code);
}

function setHeaderStatus(label, mode = "online") {
  elements.headerStatus.className = `header-status is-${mode}`;
  elements.headerStatus.querySelector("span:last-child").textContent = label;
}

function renderStationCards() {
  elements.stationGrid.replaceChildren();
  state.manifest.stations.forEach((station) => {
    const latest = service.latestForStation(station.code);
    const latestDate = Math.max(0, ...Object.values(latest).map((entry) => timestamp(entry.fecha)));
    const stale = !latestDate || Date.now() - latestDate > 3 * 60 * 60 * 1000;
    const card = document.createElement("article");
    card.className = "station-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Explorar datos de ${station.name}`);
    card.innerHTML = `
      <div class="station-card-header">
        <div>
          <h3>${station.name}</h3>
          <span class="station-code">${station.code}</span>
        </div>
        <span class="station-health${stale ? " is-stale" : ""}" title="${stale ? "Datos atrasados" : "Datos recientes"}"></span>
      </div>
      <div class="station-primary">
        <span>PM2.5</span>
        <strong>${latest.pm25 ? latest.pm25.value.toFixed(0) : "—"}</strong>
        <span>µg/m³</span>
      </div>
      <div class="station-metrics">
        <div class="station-metric">
          <span>Temperatura</span>
          <strong>${formatMetric(latest.temp, "temp")}</strong>
        </div>
        <div class="station-metric">
          <span>Humedad</span>
          <strong>${formatMetric(latest.hum, "hum")}</strong>
        </div>
      </div>
      <p class="station-time">${latestDate ? `Actualizado ${formatDate(latestDate)}` : "Sin mediciones publicadas"}</p>
    `;
    const openStation = () => {
      state.stationCode = station.code;
      elements.stationSelect.value = station.code;
      document.querySelector("#historicos").scrollIntoView({ behavior: "smooth" });
      updateExplorer();
    };
    card.addEventListener("click", openStation);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openStation();
      }
    });
    elements.stationGrid.append(card);
  });
}

function populateControls() {
  elements.stationSelect.replaceChildren(...state.manifest.stations.map((station) => {
    const option = document.createElement("option");
    option.value = station.code;
    option.textContent = station.name;
    return option;
  }));
  elements.stationSelect.value = state.stationCode;

  elements.variableSelect.replaceChildren();
  ["ambiente", "operacion"].forEach((category) => {
    const group = document.createElement("optgroup");
    group.label = category === "ambiente" ? "Ambiente" : "Operación del equipo";
    Object.entries(state.variables)
      .filter(([, variable]) => variable.category === category)
      .forEach(([key, variable]) => {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = `${variable.shortLabel} (${variable.unit})`;
        group.append(option);
      });
    elements.variableSelect.append(group);
  });
  elements.variableSelect.value = state.variableKey;
}

function pointsForVariable(rows, variableKey) {
  const column = state.variables[variableKey].column;
  return rows.flatMap((row) => {
    const value = numericValue(row[column]);
    return value === null ? [] : [{ fecha: row.fecha, value }];
  });
}

function setStatistics(summary, variable) {
  if (!summary) {
    [elements.statMin, elements.statAvg, elements.statMax, elements.statCount]
      .forEach((element) => { element.textContent = "—"; });
    return;
  }
  elements.statMin.textContent = `${summary.min.toFixed(variable.decimals)} ${variable.unit}`;
  elements.statAvg.textContent = `${summary.avg.toFixed(variable.decimals)} ${variable.unit}`;
  elements.statMax.textContent = `${summary.max.toFixed(variable.decimals)} ${variable.unit}`;
  elements.statCount.textContent = summary.count.toLocaleString("es-CL");
}

async function updateExplorer() {
  const requestId = ++state.requestId;
  const station = stationByCode(state.stationCode);
  const variable = state.variables[state.variableKey];
  elements.chartStation.textContent = station.name;
  elements.chartTitle.textContent = variable.label;
  elements.chartState.textContent = "Cargando archivos…";
  elements.chartEmpty.hidden = true;

  try {
    const rows = await service.loadHistory(state.stationCode, state.period);
    if (requestId !== state.requestId) return;
    state.currentRows = rows;
    state.currentPoints = pointsForVariable(rows, state.variableKey);
    const summary = statistics(state.currentPoints);
    setStatistics(summary, variable);
    elements.chartEmpty.hidden = state.currentPoints.length > 0;
    elements.chartCanvas.hidden = state.currentPoints.length === 0;
    elements.chartState.textContent = `${PERIODS[state.period].label} · ${state.currentPoints.length.toLocaleString("es-CL")} datos`;
    if (state.currentPoints.length) {
      scheduleChart(elements.chartCanvas, state.currentPoints, variable, state.period);
    }
  } catch (error) {
    if (requestId !== state.requestId) return;
    console.error(error);
    elements.chartState.textContent = "No se pudieron cargar los datos";
    elements.chartCanvas.hidden = true;
    elements.chartEmpty.hidden = false;
    setStatistics(null, variable);
  }
}

async function refreshLive() {
  const rows = [];
  await Promise.all(state.manifest.stations.map((station, index) => new Promise((resolve) => {
    window.setTimeout(resolve, index * CONFIG.stationStaggerMs);
  }).then(async () => {
    try {
      rows.push(...await service.fetchLive(station.code));
    } catch (error) {
      console.warn(`[En vivo] ${station.code}: ${error.message}`);
    }
  })));
  if (!rows.length) return;
  service.mergeLatest(rows);
  renderStationCards();
  setHeaderStatus("En vivo · 10 min");
}

function bindEvents() {
  elements.stationSelect.addEventListener("change", () => {
    state.stationCode = elements.stationSelect.value;
    updateExplorer();
  });
  elements.variableSelect.addEventListener("change", () => {
    state.variableKey = elements.variableSelect.value;
    updateExplorer();
  });
  elements.periodGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-period]");
    if (!button) return;
    state.period = button.dataset.period;
    elements.periodGrid.querySelectorAll("button").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    updateExplorer();
  });
  elements.downloadTrigger.addEventListener("click", () => elements.downloadDialog.showModal());
  elements.confirmDownload.addEventListener("click", (event) => {
    event.preventDefault();
    if (!state.currentPoints.length) return;
    downloadSelection({
      station: stationByCode(state.stationCode),
      variableKey: state.variableKey,
      variable: state.variables[state.variableKey],
      periodLabel: PERIODS[state.period].label,
      points: state.currentPoints,
    });
    elements.downloadDialog.close();
  });
}

async function initialize() {
  try {
    state.manifest = await service.loadManifest();
    state.variables = { ...FALLBACK_VARIABLES, ...state.manifest.variables };
    await service.loadLatest();
    state.stationCode = state.manifest.stations.some((station) => station.code === state.stationCode)
      ? state.stationCode
      : state.manifest.stations[0].code;
    elements.networkNumber.textContent = state.manifest.stations.length;
    elements.networkUpdated.textContent = formatDate(state.manifest.updated_at);
    const months = new Set(state.manifest.stations.flatMap((station) => Object.keys(station.months || {})));
    elements.availability.textContent = `${months.size} meses publicados · actualización horaria`;
    populateControls();
    renderStationCards();
    bindEvents();
    setHeaderStatus("CSV horario");
    await updateExplorer();
    if (window.location.hash) {
      window.setTimeout(() => {
        document.querySelector(window.location.hash)?.scrollIntoView();
      }, 250);
    }
    refreshLive();
    window.setInterval(refreshLive, CONFIG.liveRefreshMs);
  } catch (error) {
    console.error(error);
    setHeaderStatus("Datos no disponibles", "error");
    elements.availability.textContent = "No se pudo leer el manifiesto de datos.";
  }
}

initialize();
