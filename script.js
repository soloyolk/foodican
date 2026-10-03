/* =========================================================
   FOODICAN
   Main site JavaScript
   ========================================================= */

const CONTENT_URL = "data/content.json";

document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  loadFoodicanContent();
});


/* =========================================================
   MOBILE MENU
   ========================================================= */

function initMobileMenu() {
  const menuButton = document.querySelector(".menu-btn");
  const nav = document.querySelector(".nav");

  if (!menuButton || !nav) return;

  menuButton.addEventListener("click", () => {
    nav.classList.toggle("open");
    menuButton.setAttribute(
      "aria-expanded",
      nav.classList.contains("open") ? "true" : "false"
    );
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
    });
  });
}


/* =========================================================
   LOAD CONTENT
   ========================================================= */

async function loadFoodicanContent() {
  try {
    const response = await fetch(`${CONTENT_URL}?v=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Content request failed: ${response.status}`);
    }

    const data = await response.json();

    const items = Array.isArray(data.items)
      ? data.items.map(normalizeItem)
      : [];

    items.sort((a, b) => {
      return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
    });

    renderLatest(items);
    renderCategory("food-grid", items, "food");
    renderCategory("tech-grid", items, "tech");
    renderCategory("life-grid", items, "life");

    await initFoodicanMap(items);

  } catch (error) {
    console.error("Foodican content failed to load:", error);

    showGridMessage(
      "latest-grid",
      "Content is temporarily unavailable."
    );

    showGridMessage(
      "food-grid",
      "Content is temporarily unavailable."
    );

    showGridMessage(
      "tech-grid",
      "Content is temporarily unavailable."
    );

    showGridMessage(
      "life-grid",
      "Content is temporarily unavailable."
    );

    const mapStats = document.getElementById("map-stats");

    if (mapStats) {
      mapStats.textContent = "Map temporarily unavailable";
    }
  }
}


/* =========================================================
   NORMALIZE CONTENT
   ========================================================= */

function normalizeItem(item) {

  const isShort =
    item.isShort === true ||
    item.type === "short" ||
    String(item.url || "").includes("/shorts/");

  let url = item.url || "";

  if (isShort && item.id) {
    url = `https://www.youtube.com/shorts/${item.id}`;
  }

  return {
    ...item,

    id: item.id || "",

    title:
      item.title ||
      "Foodican Adventure",

    description:
      item.description ||
      "",

    url,

    thumbnail:
      item.thumbnail ||
      (item.id
        ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`
        : ""),

    category:
      String(item.category || "food").toLowerCase(),

    location:
      item.location || "",

    isShort,

    type:
      isShort ? "short" : (item.type || "video"),

    latitude:
      typeof item.latitude === "number"
        ? item.latitude
        : null,

    longitude:
      typeof item.longitude === "number"
        ? item.longitude
        : null,

    locationPrecision:
      item.locationPrecision || "",

    locationSource:
      item.locationSource || ""
  };
}


/* =========================================================
   LATEST
   ========================================================= */

function renderLatest(items) {
  renderGrid(
    "latest-grid",
    items.slice(0, 6)
  );
}


/* =========================================================
   CATEGORY GRIDS
   ========================================================= */

function renderCategory(gridId, items, category) {

  const filtered = items
    .filter(item => item.category === category)
    .slice(0, 6);

  renderGrid(gridId, filtered);
}


/* =========================================================
   GRID
   ========================================================= */

function renderGrid(gridId, items) {

  const grid = document.getElementById(gridId);

  if (!grid) return;

  if (!items.length) {
    showGridMessage(
      gridId,
      "More Foodican adventures are coming soon."
    );

    return;
  }

  grid.innerHTML = items
    .map(renderCard)
    .join("");
}


/* =========================================================
   CARD
   ========================================================= */

function renderCard(item) {

  const title = escapeHtml(item.title);
  const description = escapeHtml(
    truncate(item.description, 110)
  );

  const thumbnail = escapeAttribute(
    item.thumbnail
  );

  const url = escapeAttribute(
    item.url
  );

  const category = escapeHtml(
    formatCategory(item.category)
  );

  const date = formatDate(
    item.publishedAt
  );

  const location = item.location
    ? escapeHtml(item.location)
    : "";

  const shortBadge = item.isShort
    ? `<span class="short-badge">SHORT</span>`
    : "";

  return `
    <article class="card">

      <a
        class="thumb"
        href="${url}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="${title}"
      >

        <img
          src="${thumbnail}"
          alt="${title}"
          loading="lazy"
          onerror="this.style.display='none'"
        />

        ${shortBadge}

      </a>

      <div class="card-body">

        <div class="card-meta">

          <span>${category}</span>

          ${date
            ? `<span>•</span><span>${date}</span>`
            : ""
          }

          ${location
            ? `<span>•</span><span>${location}</span>`
            : ""
          }

        </div>

        <h3>
          <a
            href="${url}"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${title}
          </a>
        </h3>

        ${
          description
            ? `<p>${description}</p>`
            : ""
        }

      </div>

    </article>
  `;
}


/* =========================================================
   MAP
   ========================================================= */

async function initFoodicanMap(items) {

  const mapElement =
    document.getElementById("foodican-map");

  if (!mapElement) return;

  const statsElement =
    document.getElementById("map-stats");

  const unmappedElement =
    document.getElementById("map-unmapped");

  const mappedItems = items.filter(item =>
    Number.isFinite(item.latitude) &&
    Number.isFinite(item.longitude)
  );

  const unmappedItems = items.filter(item =>
    !Number.isFinite(item.latitude) ||
    !Number.isFinite(item.longitude)
  );

  updateMapStats(
    statsElement,
    mappedItems,
    unmappedItems
  );

  renderUnmapped(
    unmappedElement,
    unmappedItems
  );

  if (!mappedItems.length) {

    mapElement.innerHTML = `
      <div class="map-loading">

        <div class="map-loading-icon">📍</div>

        <strong>Your Foodican map is getting ready.</strong>

        <span>
          Add a city, state, ZIP code, or restaurant location
          to a YouTube video and it will appear here automatically.
        </span>

      </div>
    `;

    return;
  }

  try {

    await loadLeaflet();

    createFoodicanMap(
      mapElement,
      mappedItems
    );

  } catch (error) {

    console.error(
      "Foodican map failed to load:",
      error
    );

    mapElement.innerHTML = `
      <div class="map-loading">

        <div class="map-loading-icon">🗺️</div>

        <strong>Map temporarily unavailable.</strong>

        <span>
          Your locations are still being saved and will appear
          when the map is available again.
        </span>

      </div>
    `;
  }
}


/* =========================================================
   LEAFLET LOADER
   ========================================================= */

let leafletPromise = null;

function loadLeaflet() {

  if (window.L) {
    return Promise.resolve();
  }

  if (leafletPromise) {
    return leafletPromise;
  }

  leafletPromise = new Promise((resolve, reject) => {

    const cssId = "leaflet-css";
    const scriptId = "leaflet-js";

    if (!document.getElementById(cssId)) {

      const link =
        document.createElement("link");

      link.id = cssId;
      link.rel = "stylesheet";
      link.href =
        "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

      document.head.appendChild(link);
    }

    const existingScript =
      document.getElementById(scriptId);

    if (existingScript) {

      existingScript.addEventListener(
        "load",
        () => resolve()
      );

      existingScript.addEventListener(
        "error",
        () => reject(
          new Error("Leaflet failed to load")
        )
      );

      return;
    }

    const script =
      document.createElement("script");

    script.id = scriptId;
    script.src =
      "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

    script.onload = () => resolve();

    script.onerror = () => reject(
      new Error("Leaflet failed to load")
    );

    document.body.appendChild(script);
  });

  return leafletPromise;
}


/* =========================================================
   CREATE MAP
   ========================================================= */

function createFoodicanMap(
  mapElement,
  items
) {

  mapElement.innerHTML = "";

  const map =
    L.map(mapElement, {
      scrollWheelZoom: false
    });

  L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    }
  ).addTo(map);

  const groups = new Map();

  items.forEach(item => {

    const key =
      `${Number(item.latitude).toFixed(5)},${Number(item.longitude).toFixed(5)}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(item);
  });

  const bounds = [];

  groups.forEach(locationItems => {

    const first =
      locationItems[0];

    const latitude =
      Number(first.latitude);

    const longitude =
      Number(first.longitude);

    bounds.push([
      latitude,
      longitude
    ]);

    const icon =
      L.divIcon({
        className: "map-pin",
        html: `
          <div class="foodican-pin">
            <span>🍴</span>
          </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 42],
        popupAnchor: [0, -42]
      });

    const marker =
      L.marker(
        [latitude, longitude],
        { icon }
      ).addTo(map);

    marker.bindPopup(
      createPopupHtml(locationItems),
      {
        maxWidth: 340,
        minWidth: 240
      }
    );

  });

  if (bounds.length === 1) {

    map.setView(
      bounds[0],
      12
    );

  } else {

    map.fitBounds(
      bounds,
      {
        padding: [40, 40],
        maxZoom: 12
      }
    );
  }

  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}


/* =========================================================
   MAP POPUP
   ========================================================= */

function createPopupHtml(items) {

  const first =
    items[0];

  const location =
    escapeHtml(
      first.location || "Foodican location"
    );

  const videos =
    items
      .sort(
        (a, b) =>
          new Date(b.publishedAt || 0) -
          new Date(a.publishedAt || 0)
      )
      .map(item => {

        const title =
          escapeHtml(item.title);

        const url =
          escapeAttribute(item.url);

        const thumbnail =
          escapeAttribute(item.thumbnail);

        const type =
          item.isShort
            ? "SHORT"
            : "VIDEO";

        return `
          <a
            class="foodican-popup-video"
            href="${url}"
            target="_blank"
            rel="noopener noreferrer"
          >

            <img
              class="foodican-popup-thumb"
              src="${thumbnail}"
              alt=""
              loading="lazy"
            />

            <div class="foodican-popup-video-info">

              <div class="foodican-popup-video-title">
                ${title}
              </div>

              <div class="foodican-popup-video-meta">
                ${type}
              </div>

            </div>

          </a>
        `;
      })
      .join("");

  return `
    <div class="foodican-popup">

      <div class="foodican-popup-location">
        ${location}
      </div>

      <div class="foodican-popup-title">
        Foodican Adventures
      </div>

      ${videos}

    </div>
  `;
}


/* =========================================================
   MAP STATS
   ========================================================= */

function updateMapStats(
  element,
  mappedItems,
  unmappedItems
) {

  if (!element) return;

  const locationCount =
    new Set(
      mappedItems.map(item =>
        `${item.latitude},${item.longitude}`
      )
    ).size;

  if (!mappedItems.length) {

    element.textContent =
      `${unmappedItems.length} video${
        unmappedItems.length === 1 ? "" : "s"
      } waiting for locations`;

    return;
  }

  let text =
    `${locationCount} location${
      locationCount === 1 ? "" : "s"
    } · ${mappedItems.length} video${
      mappedItems.length === 1 ? "" : "s"
    } mapped`;

  if (unmappedItems.length) {

    text +=
      ` · ${unmappedItems.length} waiting for location`;

  }

  element.textContent = text;
}


/* =========================================================
   UNMAPPED CONTENT
   ========================================================= */

function renderUnmapped(
  element,
  items
) {

  if (!element) return;

  if (!items.length) {

    element.innerHTML = "";

    return;
  }

  const shown =
    items.slice(0, 8);

  const list =
    shown
      .map(item => {

        const title =
          escapeHtml(
            truncate(item.title, 55)
          );

        const url =
          escapeAttribute(item.url);

        return `
          <a
            class="map-unmapped-item"
            href="${url}"
            target="_blank"
            rel="noopener noreferrer"
          >
            📍 ${title}
          </a>
        `;
      })
      .join("");

  const extra =
    items.length > shown.length
      ? `<div class="map-unmapped-copy">
           Showing ${shown.length} of ${items.length} videos waiting for location information.
         </div>`
      : "";

  element.innerHTML = `
    <div class="map-unmapped-inner">

      <div class="map-unmapped-title">
        A few adventures still need a location
      </div>

      <div class="map-unmapped-copy">
        Add a city, state, ZIP code, or restaurant location
        to the YouTube title or description. The next automatic
        update will add it to the map.
      </div>

      ${extra}

      <div class="map-unmapped-list">
        ${list}
      </div>

    </div>
  `;
}


/* =========================================================
   HELPERS
   ========================================================= */

function showGridMessage(
  gridId,
  message
) {

  const grid =
    document.getElementById(gridId);

  if (!grid) return;

  grid.innerHTML = `
    <div class="empty-state">
      ${escapeHtml(message)}
    </div>
  `;
}


function formatCategory(category) {

  if (!category) return "Food";

  return category.charAt(0).toUpperCase()
    + category.slice(1);
}


function formatDate(dateString) {

  if (!dateString) return "";

  const date =
    new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric"
    }
  ).format(date);
}


function truncate(
  value,
  maxLength
) {

  if (!value) return "";

  const text =
    String(value).trim();

  if (text.length <= maxLength) {
    return text;
  }

  return (
    text.substring(0, maxLength - 1).trim()
    + "…"
  );
}


function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function escapeAttribute(value) {
  return escapeHtml(value);
}