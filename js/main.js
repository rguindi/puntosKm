const SERVICE_URL =
  "https://services1.arcgis.com/nCKYwcSONQTkPA4K/ArcGIS/rest/services/Puntos_kilometricos_Espana/FeatureServer/0/query";

const form = document.getElementById("searchForm");
const carreteraEl = document.getElementById("carretera");
const pkEl = document.getElementById("pk");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const listEl = document.getElementById("list");
const countEl = document.getElementById("count");
const limpiarBtn = document.getElementById("limpiar");

function setStatus(text) {
  statusEl.textContent = text;
}

function buildWhere(carretera, pk) {
  const safeCar = carretera.trim().toLowerCase().replace(/'/g, "''");
  let where = `LOWER(nombre) LIKE '%${safeCar}%'`;
  if (pk && pk.trim() !== "") {
    const safePk = pk.trim().toLowerCase().replace(/'/g, "''");
    where += ` AND LOWER(numero) LIKE '${safePk}'`;
  }
  return where;
}

async function fetchResults(carretera, pk) {
  const params = {
    where: buildWhere(carretera, pk),
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
    orderByFields: "numero ASC",
  };

  const qs = Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
  const url = SERVICE_URL + "?" + qs;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Error en la petición: " + res.status);
  return await res.json();
}

// Obtener municipio y provincia a partir de coordenadas
async function getMunicipioProvincia(lat, lon, maxRetries = 5, delayMs = 500) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&addressdetails=1`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "MiApp/1.0 (tuemail@ejemplo.com)", // recomendado por Nominatim
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const addr = data.address || {};

      const municipio =
        addr.city || addr.town || addr.village || addr.hamlet || "—";
      const provincia = addr.province || "—";

      return `${municipio} / ${provincia}`;
    } catch (err) {
      console.warn(`Intento ${attempt} fallido para Nominatim:`, err.message);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs)); // espera antes de reintentar
      } else {
        return "—";
      }
    }
  }
}

async function buscar(e) {
  if (e) e.preventDefault();
  const carretera = carreteraEl.value;
  const pk = pkEl.value;
  if (!carretera.trim()) {
    carreteraEl.focus();
    return;
  }

  resultsEl.hidden = true;
  listEl.innerHTML = "";
  countEl.textContent = "";
  setStatus("Buscando...");

  try {
    let data = await fetchResults(carretera, pk);

    if (
      (!data.features || data.features.length === 0) &&
      /[a-zA-Z]+\d+/.test(carretera)
    ) {
      const modCarretera = carretera.replace(/([a-zA-Z]+)(\d+)/, "$1-$2");
      setStatus(`Sin resultados. Reintentando con guion: ${modCarretera}...`);
      data = await fetchResults(modCarretera, pk);
    }

    if (!data.features || data.features.length === 0) {
      setStatus("No se encontraron resultados.");
      resultsEl.hidden = true;
      return;
    }

    setStatus("");
    resultsEl.hidden = false;
    countEl.textContent = `${data.features.length} resultado(s)`;

    // Mostrar inmediatamente y luego actualizar municipio/provincia
    data.features.forEach(async (f) => {
      const attrs = f.attributes || {};
      const geom = f.geometry || {};
      const lat = geom.y ?? (geom.coordinates ? geom.coordinates[1] : "—");
      const lon = geom.x ?? (geom.coordinates ? geom.coordinates[0] : "—");
      const nombre = attrs.nombre ?? "—";
      const numero = attrs.numero ?? "—";
      const sentido = attrs.sentidopkd ?? "—";
      const fuente = attrs.fuented ?? "—";

      const gmapsHref =
        lat !== "—" && lon !== "—"
          ? `https://www.google.com/maps?q=${lat},${lon}`
          : "#";

      // Creamos item inicial sin municipio/provincia
      const itemEl = document.createElement("div");
      itemEl.className = "item";
      itemEl.innerHTML = `
  <div class="mb-2">
    <strong class="text-primary">${escapeHtml(nombre)}</strong> — 
    PK: <span class="badge bg-info text-dark">${escapeHtml(numero)}</span>
  </div>
  <div class="meta mb-1">
    <span class="municipio fw-bold text-success">Cargando municipio/provincia...</span> — 
    <span>Sentido: </span> <span class="sentido text-danger">${escapeHtml(
        sentido
      )}</span> — 
      <small>
      <span class="text-muted">
      <img src="./img/google-maps.png" alt="Google Maps" style="width:16px; height:16px; vertical-align:middle; margin-left:4px;">
      </span> — 
      <a class="link-primary fw-bold" href="${gmapsHref}" target="_blank">ver en Google Maps</a>
      </small>
      </div>
  <br>
`;

      listEl.appendChild(itemEl);

      // Llamada a Nominatim asíncrona
      // 🔹 Actualizar municipio/provincia cuando llegue
      if (lat !== "—" && lon !== "—") {
        getMunicipioProvincia(lat, lon)
          .then((mp) => {
            const spanMunicipio = itemEl.querySelector(".municipio");
            if (spanMunicipio) {
              spanMunicipio.textContent = mp;
            }
          })
          .catch((err) => console.error(err));
      }
    });
  } catch (err) {
    console.error(err);
    setStatus("Error: " + err.message);
  }
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c])
  );
}

form.addEventListener("submit", buscar);
limpiarBtn.addEventListener("click", () => {
  carreteraEl.value = "";
  pkEl.value = "";
  listEl.innerHTML = "";
  resultsEl.hidden = true;
  setStatus("");
  carreteraEl.focus();
});
