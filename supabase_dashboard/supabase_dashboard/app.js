const supabaseClient = supabase.createClient(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.anonKey
);

let historyChart = null;

const elements = {
  frecuencia: document.getElementById("current-frecuencia"),
  bomba: document.getElementById("current-bomba"),
  caudal: document.getElementById("current-caudal"),
  presion: document.getElementById("current-presion"),
  nivel: document.getElementById("current-nivel"),
  form: document.getElementById("filter-form"),
  startDate: document.getElementById("start-date"),
  endDate: document.getElementById("end-date"),
  message: document.getElementById("message"),
  table: document.getElementById("history-table"),
  refresh: document.getElementById("btn-refresh"),
  chart: document.getElementById("history-chart")
};

document.addEventListener("DOMContentLoaded", () => {
  setDefaultDateRange();
  loadCurrentData();
  loadHistoricalData();

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    loadHistoricalData();
  });

  elements.refresh.addEventListener("click", () => {
    loadCurrentData();
    loadHistoricalData();
  });

  // Actualización automática del valor actual cada 10 segundos.
  setInterval(loadCurrentData, 10000);
});

function setDefaultDateRange() {
  const now = new Date();

  const twoHoursAgo = new Date();
  twoHoursAgo.setHours(now.getHours() - 2);

  elements.startDate.value = toDateTimeLocal(twoHoursAgo);
  elements.endDate.value = toDateTimeLocal(now);
}

function toDateTimeLocal(date) {
  const pad = (number) => String(number).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(dateText) {
  return new Date(dateText).toLocaleString("es-EC", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function showMessage(text, type = "") {
  elements.message.textContent = text;
  elements.message.className = `message ${type}`;
}

function validateRanges(row) {
  return {
    frecuencia: clampNumber(row.frecuencia / 10, 0, 60),
    caudal: clampNumber(row.caudal / 100,  0, 600),
    presion: clampNumber(row.presion, 0, 50000),
    nivel: Math.trunc(row.nivel  * 11309.73 / 3785.41) / 100,
    bomba: Boolean(row.bomba),
    created_at: row.created_at
  };
}

function clampNumber(value, min, max) {
  const number = Number(value);

  if (Number.isNaN(number)) return 0;
  if (number > 50000 ) return min;
  return Math.min(Math.max(number, min), max);
}

async function loadCurrentData() {
  const { data, error } = await supabaseClient
    .from(SUPABASE_CONFIG.tableName)
    .select("created_at, frecuencia, bomba, caudal, presion, nivel")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error(error);
    showMessage("No se pudo cargar el valor actual. Revise conexión, tabla o permisos RLS.", "error");
    return;
  }

  if (!data) return;

  const row = validateRanges(data);

  elements.frecuencia.textContent = row.frecuencia.toFixed(1);
  elements.bomba.textContent = row.bomba ? "ON" : "OFF";
  elements.bomba.className = row.bomba ? "estado-on" : "estado-off";
  elements.caudal.textContent = row.caudal.toFixed(1);
  elements.presion.textContent = row.presion.toFixed(0);
  elements.nivel.textContent = row.nivel.toFixed(1);
}

async function loadHistoricalData() {
  const start = elements.startDate.value;
  const end = elements.endDate.value;

  if (!start || !end) {
    showMessage("Seleccione fecha inicial y fecha final.", "error");
    return;
  }

  if (new Date(start) > new Date(end)) {
    showMessage("La fecha inicial no puede ser mayor que la fecha final.", "error");
    return;
  }

  showMessage("Cargando datos históricos...");

  const { data, error } = await supabaseClient
    .from(SUPABASE_CONFIG.tableName)
    .select("created_at, frecuencia, bomba, caudal, presion, nivel")
    .gte("created_at", new Date(start).toISOString())
    .lte("created_at", new Date(end).toISOString())
    .order("created_at", { ascending: true })
    .limit(5000);

  if (error) {
    console.error(error);
    showMessage("No se pudo cargar el histórico. Revise conexión, tabla o permisos RLS.", "error");
    return;
  }

  const rows = (data || []).map(validateRanges);

  if (rows.length === 0) {
    renderTable([]);
    renderChart([]);
    showMessage("No existen registros para el rango seleccionado.", "error");
    return;
  }

  renderTable(rows);
  renderChart(rows);
  showMessage(`Histórico cargado correctamente: ${rows.length} registros.`, "success");
}

function renderTable(rows) {
  if (rows.length === 0) {
    elements.table.innerHTML = `<tr><td colspan="6">Sin datos para mostrar.</td></tr>`;
    return;
  }

  elements.table.innerHTML = rows.map((row) => `
    <tr>
      <td>${formatDate(row.created_at)}</td>
      <td>${row.frecuencia.toFixed(1)}</td>
      <td class="${row.bomba ? "estado-on" : "estado-off"}">${row.bomba ? "ON" : "OFF"}</td>
      <td>${row.caudal.toFixed(1)}</td>
      <td>${row.presion.toFixed(0)}</td>
      <td>${row.nivel.toFixed(1)}</td>
    </tr>
  `).join("");
}

function renderChart(rows) {
  const labels = rows.map((row) => formatDate(row.created_at));

  const datasets = [
    {
      label: "Frecuencia (Hz)",
      data: rows.map((row) => row.frecuencia),
      yAxisID: "yFrecuencia",
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.3
    },
    {
      label: "Caudal (GPD)",
      data: rows.map((row) => row.caudal),
      yAxisID: "yCaudal",
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.2
    },
    {
      label: "Presión (PSI)",
      data: rows.map((row) => row.presion),
      yAxisID: "yPresion",
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.3
    },
    {
      label: "Nivel (GAL)",
      data: rows.map((row) => row.nivel),
      yAxisID: "yNivel",
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.3
    },
    {
      label: "Bomba ON/OFF",
      data: rows.map((row) => row.bomba ? 1 : 0),
      yAxisID: "yBomba",
      stepped: true,
      pointRadius: 0,
      pointHoverRadius: 5,
      tension: 0.3
    }
  ];

  if (historyChart) {
    historyChart.destroy();
  }

  historyChart = new Chart(elements.chart, {
    type: "line",
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (context.dataset.label === "Bomba ON/OFF") {
                return `Bomba: ${context.raw === 1 ? "ON" : "OFF"}`;
              }
              return `${context.dataset.label}: ${context.raw}`;
            }
          }
        }
      },
      scales: {
        yFrecuencia: {
          type: "linear",
          position: "left",
          min: 0,
          max: 60,
          title: {
            display: true,
            text: "Hz"
          }
        },
        yCaudal: {
          type: "linear",
          position: "right",
          min: 0,
          max: 500,
          grid: {
            drawOnChartArea: false
          },
          title: {
            display: true,
            text: "GPD"
          }
        },
        yPresion: {
          type: "linear",
          position: "right",
          min: 0,
          max: 5000,
          display: false
        },
        yNivel: {
          type: "linear",
          position: "right",
          min: 0,
          max: 1000,
          display: false
        },
        yBomba: {
          type: "linear",
          position: "left",
          min: 0,
          max: 1,
          display: false
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12
          }
        }
      }
    }
  });
}
