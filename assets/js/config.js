export const CONFIG = {
  projectName: "AUCA Cochrane",
  dataRoot: "data",
  liveApiBase: "https://api-sensores.cmasccp.cl/listarDatosEstructuradosV2",
  liveProjectId: 18,
  liveRefreshMs: 10 * 60 * 1000,
  stationStaggerMs: 350,
  defaultStation: "HIRI-AUCA-1",
  defaultVariable: "pm25",
  defaultPeriod: "7d",
};

export const PERIODS = {
  "24h": { label: "24 horas", days: 1 },
  "7d": { label: "7 días", days: 7 },
  "30d": { label: "30 días", days: 30 },
  total: { label: "Todo el historial", days: null },
};

export const FALLBACK_VARIABLES = {
  pm1: { column: "pm1_ugm3", label: "Material particulado PM1", shortLabel: "PM1", unit: "µg/m³", color: "#75b8c2", decimals: 0, category: "ambiente" },
  pm25: { column: "pm25_ugm3", label: "Material particulado PM2.5", shortLabel: "PM2.5", unit: "µg/m³", color: "#1f5d58", decimals: 0, category: "ambiente" },
  pm10: { column: "pm10_ugm3", label: "Material particulado PM10", shortLabel: "PM10", unit: "µg/m³", color: "#e3a83c", decimals: 0, category: "ambiente" },
  temp: { column: "temperatura_c", label: "Temperatura ambiental", shortLabel: "Temperatura", unit: "°C", color: "#b94b3d", decimals: 1, category: "ambiente" },
  hum: { column: "humedad_pct", label: "Humedad ambiental", shortLabel: "Humedad", unit: "%", color: "#4f86a6", decimals: 1, category: "ambiente" },
  temp_internal: { column: "temperatura_interna_c", label: "Temperatura interna del equipo", shortLabel: "Temp. interna", unit: "°C", color: "#9d5f37", decimals: 1, category: "operacion" },
  hum_internal: { column: "humedad_interna_pct", label: "Humedad interna del equipo", shortLabel: "Hum. interna", unit: "%", color: "#7a6ca8", decimals: 1, category: "operacion" },
  relay: { column: "relay", label: "Estado del calefactor", shortLabel: "Calefactor", unit: "estado", color: "#8dad6a", decimals: 0, category: "operacion" },
  signal: { column: "senal", label: "Señal telefónica", shortLabel: "Señal", unit: "nivel", color: "#486a68", decimals: 0, category: "operacion" },
};

export const LIVE_FIELD_MAP = {
  pm1: "PMS5003 [Material particulado PM 1.0 (µg/m³)]",
  pm25: "PMS5003 [Material particulado PM 2.5 (µg/m³)]",
  pm10: "PMS5003 [Material particulado PM 10 (µg/m³)]",
  temp: "PMS5003 [Grados celcius (°C)]",
  hum: "PMS5003 [Humedad (%)]",
  temp_internal: "CALEFACTORCMAS [TEMP INTERNA (°C)]",
  hum_internal: "CALEFACTORCMAS [HUM INTERNA (%)]",
  relay: "CALEFACTORCMAS [Relay (Bool)]",
  signal: "SIM7600G [Intensidad señal telefónica (Adimensional)]",
};
