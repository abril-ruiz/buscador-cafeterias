let map;
let markers = [];
let markerCluster = null;

// Mostrar/ocultar indicador de carga
function showLoading(show) {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    if (show) {
      overlay.classList.remove("hidden");
    } else {
      overlay.classList.add("hidden");
    }
  }
}

// Calcular distancia entre dos puntos (Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radio de la Tierra en metros
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
// Crear contenido del popup
function createPopupContent(place) {
  let content = `<b>${place.display_name}</b><br>`;

  const parts = place.display_name.split(",");
  if (parts.length > 1) {
    content += `<small>${parts.slice(0, 2).join(", ")}</small>`;
  }
  // Botón para ver en OpenStreetMap
  content += `<br><a href="https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=19/${place.lat}/${place.lon}"target="_blank" style="display:inline-block; background:#8d6e63; color:white; text-decoration:none; padding:6px 12px; border-radius:4px; font-size:0.9rem; margin-top:8px;">Ver en mapa</a>`;
  return content;
}
// Limpiar marcadores anteriores
function clearMarkers() {
  if (markerCluster) {
    markerCluster.clearLayers();
  }
  markers = [];
}
// Manejar errores de geolocalización
function handleGeolocationError(error) {
  let message = "No se pudo acceder a tu ubicación. ";
  switch (error.code) {
    case error.PERMISSION_DENIED:
      message += "Permiso denegado.";
      break;
    case error.POSITION_UNAVAILABLE:
      message += "Ubicación no disponible.";
      break;
    case error.TIMEOUT:
      message += "Tiempo de espera agotado.";
      break;
    default:
      message += "Error desconocido.";
  }
  document.getElementById("status").textContent =
    message + " Mostrando cafeterías en Buenos Aires.";
}

function initMap() {
  // Verificar si el mapa ya está inicializado
  if (map) {
    return; // Evitar inicializar de nuevo
  }

  // Coordenadas iniciales: Buenos Aires, Argentina
  const defaultCenter = [-34.6118, -58.3965];

  map = L.map("map").setView(defaultCenter, 13);

  // Capa de OpenStreetMap
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Inicializar MarkerCluster
  markerCluster = L.markerClusterGroup();
  map.addLayer(markerCluster);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLocation = [
          position.coords.latitude,
          position.coords.longitude,
        ];
        map.setView(userLocation, 14);
        document.getElementById("status").textContent =
          '📍 Ubicación detectada. Haz clic en "Buscar Cafeterías Cercanas".';
      },
      (error) => {
        handleGeolocationError(error);
      },
      { timeout: 30000, maximumAge: 60000 },
    );
  } else {
    document.getElementById("status").textContent =
      "⚠️ Geolocalización no soportada. Mostrando cafeterías en Buenos Aires.";
  }
}

// Buscar cafeterías
async function searchCafes() {
  clearMarkers();
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Buscando cafeterías...";
  showLoading(true);
  try {
    const searchParams = getSearchParams();
    const cafes = await fetchCafes(searchParams);

    if (cafes.length === 0) {
      statusEl.textContent = "No se encontraron cafeterías en esta zona.";
      showLoading(false);
      return;
    }
    //Mostrar resultados
    displayCafes(cafes);
    statusEl.textContent = `Se encontraron ${cafes.length} cafeterías.`;
  } catch (error) {
    console.error("Error:", error);
    statusEl.textContent = "Error al buscar cafeterías. Inténtalo de nuevo.";
  } finally {
    showLoading(false);
  }
}
function getSearchParams() {
  const bounds = map.getBounds();
  const center = bounds.getCenter();

  // Obtener radio de búsqueda (en metros)
  const radiusInput = document.getElementById("radius");
  const radius = radiusInput ? parseInt(radiusInput.value) : 20000; // Default 20km

  // Obtener tipo de búsqueda
  const typeSelect = document.getElementById("type-filter");
  const type = typeSelect ? typeSelect.value : "cafe";

  return {
    center: center,
    radius: radius,
    type: type,
  };
}
//Buscar cafeterías usando Nominatim
async function fetchCafes(params) {
  const { center, radius, type } = params;
  // Calcular bounds ampliados según el radio
  const earthRadius = 6371000; // metros
  const latDelta = (radius / earthRadius) * (180 / Math.PI);
  const lonDelta =
    ((radius / earthRadius) * (180 / Math.PI)) /
    Math.cos((center.lat * Math.PI) / 180);

  const bounds = {
    west: center.lng - lonDelta,
    east: center.lng + lonDelta,
    south: center.lat - latDelta,
    north: center.lat + latDelta,
  };
  let query = "cafe";
  if (type === "coffee_shop") {
    query = "coffee shop";
  } else if (type === "all") {
    query = "cafe coffee";
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=25&viewbox=${bounds.west},${bounds.south},${bounds.east},${bounds.north}&bounded=1&countrycodes=ar`;
  try {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(
        `Error en la API ${response.status}: ${response.statusText}`,
      );

    const data = await response.json();
    return data.filter((place) => {
      const cafeLat = parseFloat(place.lat);
      const cafeLon = parseFloat(place.lon);
      const distance = calculateDistance(
        center.lat,
        center.lng,
        cafeLat,
        cafeLon,
      );
      return distance <= radius;
    });
  } catch (error) {
    throw error;
  }
}

// Mostrar cafeterías en el mapa
function displayCafes(cafes) {
  cafes.forEach((place) => {
    const lat = parseFloat(place.lat);
    const lon = parseFloat(place.lon);

    const popupContent = createPopupContent(place);

    const marker = L.marker([lat, lon]);
    marker.bindPopup(popupContent);
    markerCluster.addLayer(marker);
    markers.push(marker);
  });
}

// Buscar por direccion o nombre
async function searchByAddress(event) {
  if (event) {
    event.preventDefault();
  }

  const addressInput = document.getElementById("address-search");
  if (!addressInput) {
    console.error("Elemento #address-search no encontrado.");
    return;
  }

  const query = addressInput.value.trim();
  if (!query) {
    const statusEl = document.getElementById("status");
    if (statusEl)
      statusEl.textContent =
        "Por favor, ingresa una dirección o nombre de cafetería.";
    return;
  }

  const statusEl = document.getElementById("status");
  statusEl.textContent = "Buscando...";
  showLoading(true);
  try {
    //Obtener centro del mapa actual
    const center = map.getCenter();
    const normalizedQuery = query
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); //Eliminar acentos

    let url =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(`${query} cafe`)}` +
      `&format=json&limit=15&countrycodes=ar&extratags=1`;

    let response = await fetch(url);
    let data = await response.json();
    if (data.length === 0) {
      url =
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}` +
        `&format=json&limit=15&countrycodes=ar&extratags=1`;
      response = await fetch(url);
      data = await response.json();
    }
    if (data.length === 0) {
      url =
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(normalizedQuery)}` +
        `&format=json&limit=15&extratags=1`;
      response = await fetch(url);
      data = await response.json();
    }
    if (data.length === 0) {
      statusEl.textContent = "No se encontraron resultados para esa búsqueda.";
      showLoading(false);
      return;
    }
    //filtrar y puntuar resultados
    const scoredResults = data.map((place) => {
      const name = place.display_name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      let score = 0;
      // +30 puntos si es un café/coffe_shop
      if (
        place.class === "amenity" &&
        (place.type === "cafe" || place.type === "coffee_shop")
      ) {
        score += 30;
      }
      //  +20 puntos si el nombre contiene el query
      if (name.includes(normalizedQuery)) score += 20;
      // +10 puntos si está en argentina
      if (place.display_name.toLowerCase().includes("argentina")) {
        score += 10;
      }
      // calcular distancia al centro del mapa
      const distance = calculateDistance(
        center.lat,
        center.lng,
        parseFloat(place.lat),
        parseFloat(place.lon),
      );
      // -1 punto por cada km de distancia
      score -= distance / 1000;

      return {
        ...place,
        score: score,
        distance: distance,
      };
    });
    // Ordenar por puntuación descendente
    scoredResults.sort((a, b) => b.score - a.score);
    // Tomar el mejor resultado
    const bestMatch =
      scoredResults.find((r) => r.score > 10) || scoredResults[0];
    if (!bestMatch) {
      statusEl.textContent =
        "No se encontraron resultados relevantes para esa búsqueda.";
      showLoading(false);
      return;
    }
    const location = [parseFloat(bestMatch.lat), parseFloat(bestMatch.lon)];
    map.setView(location, 17);

    //mostrar distancia si está cerca - 5km
    const distanceText =
      bestMatch.distance < 5000 ? ` (${Math.round(bestMatch.distance)}m)` : "";

    statusEl.textContent = `Encontrado: ${bestMatch.display_name}${distanceText}`;
    setTimeout(searchCafes, 1000);
  } catch (error) {
    console.error("Error:", error);
    if (!navigator.onLine) {
      statusEl.innerHTML =
        " <b>Sin conexión a internet</b><br>Verifica tu conexión y vuelve a intentarlo.";
    } else if (error.message.includes("Failed to fetch")) {
      statusEl.innerHTML =
        "<b>Servicio no disponible</b><br>El servidor está ocupado. Espera unos segundos e intenta nuevamente.";
    } else {
      statusEl.innerHTML =
        " <b>Error inesperado</b><br>No pudimos completar tu búsqueda. Intenta nuevamente.";
    }
  } finally {
    showLoading(false);
  }
}
// Botones de zoom
function setupZoomControls() {
  document.getElementById("zoom-in")?.addEventListener("click", () => {
    map.setZoom(map.getZoom() + 1);
  });

  document.getElementById("zoom-out")?.addEventListener("click", () => {
    map.setZoom(map.getZoom() - 1);
  });
}
// Eventos
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupZoomControls();
  document.getElementById("search-btn")?.addEventListener("click", (event) => {
    event.preventDefault();
    searchCafes();
  });
  document
    .getElementById("address-search-btn")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      searchByAddress(event);
    });
  const addressInput = document.getElementById("address-search");
  if (addressInput) {
    addressInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchByAddress(e);
      }
    });
  }
});
