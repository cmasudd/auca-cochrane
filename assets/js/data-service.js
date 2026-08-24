import { LIVE_FIELD_MAP, PERIODS } from "./config.js";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows[0];
  return rows.slice(1).map((cells) => Object.fromEntries(
    headers.map((header, index) => [header, cells[index] ?? ""]),
  ));
}

function numericValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export class DataService {
  constructor(config) {
    this.config = config;
    this.manifest = null;
    this.latestRows = [];
    this.historyCache = new Map();
  }

  async fetchText(path, version = "") {
    const url = new URL(path, document.baseURI);
    if (version) url.searchParams.set("v", version);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status} en ${path}`);
    return response.text();
  }

  async loadManifest() {
    const text = await this.fetchText(`${this.config.dataRoot}/manifest.json`, Date.now());
    this.manifest = JSON.parse(text);
    return this.manifest;
  }

  async loadLatest() {
    const version = this.manifest?.updated_at || Date.now();
    const text = await this.fetchText(`${this.config.dataRoot}/latest.csv`, version);
    this.latestRows = parseCsv(text);
    return this.latestRows;
  }

  latestForStation(code) {
    const output = {};
    this.latestRows
      .filter((row) => row.codigo === code)
      .forEach((row) => {
        const value = numericValue(row.valor);
        if (value === null) return;
        const current = output[row.variable];
        if (!current || timestamp(row.fecha) > timestamp(current.fecha)) {
          output[row.variable] = { value, fecha: row.fecha, source: "csv" };
        }
      });
    return output;
  }

  latestTimestamp(code) {
    return Math.max(
      0,
      ...this.latestRows
        .filter((row) => row.codigo === code)
        .map((row) => timestamp(row.fecha)),
    );
  }

  stationMeta(code) {
    return this.manifest?.stations?.find((station) => station.code === code) || null;
  }

  pathsForPeriod(station, period) {
    const months = Object.keys(station.months || {}).sort();
    if (period === "total") return months.flatMap((month) => station.months[month]);

    const latest = timestamp(station.latest_at) || this.latestTimestamp(station.code) || Date.now();
    const cutoff = latest - PERIODS[period].days * 24 * 60 * 60 * 1000;
    return months
      .filter((month) => {
        const [year, monthNumber] = month.split("-").map(Number);
        return new Date(year, monthNumber, 1).getTime() >= cutoff;
      })
      .flatMap((month) => station.months[month]);
  }

  async loadHistory(code, period) {
    const cacheKey = `${code}|${period}|${this.manifest?.updated_at || ""}`;
    if (this.historyCache.has(cacheKey)) return this.historyCache.get(cacheKey);

    const station = this.stationMeta(code);
    if (!station) return [];
    const paths = this.pathsForPeriod(station, period);
    const groups = await Promise.all(paths.map(async (path) => (
      parseCsv(await this.fetchText(path, this.manifest.updated_at))
    )));
    const rows = groups.flat().sort((left, right) => timestamp(left.fecha) - timestamp(right.fecha));
    if (period === "total" || !rows.length) {
      this.historyCache.set(cacheKey, rows);
      return rows;
    }

    const latest = timestamp(rows[rows.length - 1].fecha);
    const cutoff = latest - PERIODS[period].days * 24 * 60 * 60 * 1000;
    const filtered = rows.filter((row) => timestamp(row.fecha) >= cutoff);
    this.historyCache.set(cacheKey, filtered);
    return filtered;
  }

  async fetchLive(code) {
    const url = new URL(this.config.liveApiBase);
    url.searchParams.set("tabla", "datos");
    url.searchParams.set("disp.id_proyecto", String(this.config.liveProjectId));
    url.searchParams.set("disp.codigo_interno", code);
    url.searchParams.set("order_by", "fecha_insercion");
    url.searchParams.set("limite", "1");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const record = payload?.data?.tableData?.[0];
      if (!record?.fecha) return [];

      return Object.entries(LIVE_FIELD_MAP).flatMap(([variable, field]) => {
        const value = numericValue(record[field]);
        if (value === null || value === -1) return [];
        return [{ codigo: code, fecha: record.fecha, variable, valor: String(value), source: "api" }];
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  mergeLatest(rows) {
    const merged = new Map(
      this.latestRows.map((row) => [`${row.codigo}|${row.variable}`, row]),
    );
    rows.forEach((row) => {
      const key = `${row.codigo}|${row.variable}`;
      const current = merged.get(key);
      if (!current || timestamp(row.fecha) >= timestamp(current.fecha)) merged.set(key, row);
    });
    this.latestRows = [...merged.values()];
  }
}

export { numericValue, parseCsv, timestamp };
