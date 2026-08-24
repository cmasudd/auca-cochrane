let activeChart = null;

function readableDate(value, period) {
  const date = new Date(value);
  if (period === "24h") {
    return date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    ...(period === "total" ? { year: "2-digit" } : {}),
  });
}

function downsample(points, maximum = 420) {
  if (points.length <= maximum) return points;
  const size = Math.ceil(points.length / maximum);
  const output = [];
  for (let index = 0; index < points.length; index += size) {
    const group = points.slice(index, index + size);
    const valid = group.filter((point) => Number.isFinite(point.value));
    if (!valid.length) continue;
    output.push({
      fecha: valid[Math.floor(valid.length / 2)].fecha,
      value: valid.reduce((sum, point) => sum + point.value, 0) / valid.length,
    });
  }
  return output;
}

export function statistics(points) {
  const values = points.map((point) => point.value).filter(Number.isFinite);
  if (!values.length) return null;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    count: values.length,
  };
}

export function renderChart(canvas, points, variable, period) {
  if (activeChart) {
    activeChart.destroy();
    activeChart = null;
  }
  if (!points.length || !window.Chart) return null;

  const sampled = downsample(points);
  activeChart = new window.Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: sampled.map((point) => readableDate(point.fecha, period)),
      datasets: [{
        label: `${variable.label} (${variable.unit})`,
        data: sampled.map((point) => point.value),
        borderColor: variable.color,
        backgroundColor: `${variable.color}1f`,
        borderWidth: 2,
        pointRadius: sampled.length < 90 ? 2 : 0,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.24,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 260 },
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.parsed.y.toFixed(variable.decimals)} ${variable.unit}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#627774", maxTicksLimit: 9, maxRotation: 0 },
        },
        y: {
          beginAtZero: variable.category === "ambiente" && variable.unit === "µg/m³",
          grid: { color: "rgba(16, 59, 58, 0.08)" },
          ticks: { color: "#627774" },
          title: { display: true, text: variable.unit, color: "#627774" },
        },
      },
    },
  });
  return activeChart;
}

export function scheduleChart(canvas, points, variable, period) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => renderChart(canvas, points, variable, period));
  });
}
