function escapeCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadSelection({ station, variableKey, variable, periodLabel, points }) {
  const header = ["estacion", "codigo", "fecha", "variable", "unidad", "valor"];
  const lines = [header.join(",")];
  points.forEach((point) => {
    lines.push([
      station.name,
      station.code,
      point.fecha,
      variable.label,
      variable.unit,
      point.value,
    ].map(escapeCell).join(","));
  });

  const blob = new Blob([`\ufeff${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safePeriod = periodLabel.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
  anchor.href = url;
  anchor.download = `${station.name}-${variableKey}-${safePeriod}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
