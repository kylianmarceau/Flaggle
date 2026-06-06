const COUNTRIES = window.COUNTRIES;
const TOTAL = COUNTRIES.length;
const ASSET_VERSION = "2026-06-06-map-tools";
const CONTINENT_ORDER = ["Africa", "Asia", "Europe", "North America", "Oceania", "South America"];
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 560;
const MAP_MIN_ZOOM = 1;
const MAP_MAX_ZOOM = 6;
const MAP_ZOOM_STEP = 1.35;
const MICROSTATE_CODES = new Set(["AD", "AG", "BB", "BH", "DM", "GD", "KN", "LC", "LI", "MC", "MV", "MT", "NR", "SM", "ST", "TV", "VA", "VC"]);

const flagGuessed = new Set();
const mapGuessed = new Set();
let activeMode = "flag";
let current = null;
let lastIndex = -1;
let flagStreak = 0;
let flagAttempts = 0;
let flagCorrectAnswers = 0;
let mapStreak = 0;
let mapAttempts = 0;
let mapCorrectAnswers = 0;
let flagSelectionToken = 0;
let mapLoadPromise = null;
let mapReady = false;
let mapZoom = 1;
let missingOverlayVisible = false;

const flagCache = new Map();
const mapPathsByCode = new Map();
const mapMarkersByCode = new Map();
const mapMissingDotsByCode = new Map();
const mapFeatureMetaByCode = new Map();

const modeTitle = document.getElementById("modeTitle");
const modeCopy = document.getElementById("modeCopy");
const modeTabs = [...document.querySelectorAll("[data-mode]")];
const modePanels = [...document.querySelectorAll("[data-mode-panel]")];

const flagWrap = document.getElementById("flagWrap");
const counter = document.getElementById("counter");
const remaining = document.getElementById("remaining");
const streakStat = document.getElementById("streakStat");
const accuracyStat = document.getElementById("accuracyStat");
const progressText = document.getElementById("progressText");
const statusPill = document.getElementById("statusPill");
const progressFill = document.getElementById("progressFill");
const feedback = document.getElementById("feedback");
const guessedBody = document.getElementById("guessedBody");
const guessForm = document.getElementById("guessForm");
const guessInput = document.getElementById("guessInput");
const hintButton = document.getElementById("hintButton");
const skipButton = document.getElementById("skipButton");
const resetButton = document.getElementById("resetButton");

const worldMapWrap = document.getElementById("worldMapWrap");
const mapStatusPill = document.getElementById("mapStatusPill");
const mapLoadedText = document.getElementById("mapLoadedText");
const mapProgressText = document.getElementById("mapProgressText");
const mapProgressFill = document.getElementById("mapProgressFill");
const mapGuessForm = document.getElementById("mapGuessForm");
const mapGuessInput = document.getElementById("mapGuessInput");
const mapFeedback = document.getElementById("mapFeedback");
const mapResetButton = document.getElementById("mapResetButton");
const mapZoomOutButton = document.getElementById("mapZoomOutButton");
const mapZoomInButton = document.getElementById("mapZoomInButton");
const mapZoomResetButton = document.getElementById("mapZoomResetButton");
const mapZoomReadout = document.getElementById("mapZoomReadout");
const missingCountriesButton = document.getElementById("missingCountriesButton");

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(st|saint)\./g, " saint ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|republic|state|kingdom|federal|democratic|people|peoples|islamic|commonwealth|plurinational|bolivarian|united|of|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExactName(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(st|saint)\./g, " saint ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasesFor(country) {
  const values = [country.name, country.code, ...country.aliases];
  return new Set(values.map(normalize).filter(Boolean));
}

function fullNameFor(country) {
  return normalizeExactName(country.name);
}

function exactNamesFor(country) {
  const values = [country.name, ...country.aliases];
  return new Set(values.map(normalizeExactName).filter(Boolean));
}

function activeGuessedSet() {
  return activeMode === "map" ? mapGuessed : flagGuessed;
}

function activeStreak() {
  return activeMode === "map" ? mapStreak : flagStreak;
}

function activeAttempts() {
  return activeMode === "map" ? mapAttempts : flagAttempts;
}

function activeCorrectAnswers() {
  return activeMode === "map" ? mapCorrectAnswers : flagCorrectAnswers;
}

function setFeedback(text, type = "") {
  feedback.textContent = text;
  feedback.className = "feedback" + (type ? " " + type : "");
}

function setMapFeedback(text, type = "") {
  mapFeedback.textContent = text;
  mapFeedback.className = "feedback" + (type ? " " + type : "");
}

function setFlagControlsEnabled(enabled) {
  guessInput.disabled = !enabled;
  hintButton.disabled = !enabled;
  skipButton.disabled = !enabled;
}

function setMode(mode) {
  activeMode = mode;
  modeTabs.forEach((tab) => {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  modePanels.forEach((panel) => {
    const isActive = panel.dataset.modePanel === mode;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  });

  if (mode === "map") {
    modeTitle.textContent = "Country Guesser";
    modeCopy.textContent = "Name every country on the world map. Each correct answer lights up its territory until the whole board is complete.";
    renderGuessed();
    initWorldMap();
    mapGuessInput.focus({ preventScroll: true });
  } else {
    modeTitle.textContent = "Flag Rush";
    modeCopy.textContent = "A faster, punchier take on the country flag guessing game. Decode the flag, build your streak, and fill the continent board.";
    renderGuessed();
    guessInput.focus();
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function preloadFlag(country) {
  if (flagCache.has(country.src)) {
    return flagCache.get(country.src);
  }

  const promise = new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.loading = "eager";
    image.onload = async () => {
      try {
        if (image.decode) await image.decode();
      } catch {
        // The image is still usable if decode() rejects after onload.
      }
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = country.src;
  });

  flagCache.set(country.src, promise);
  return promise;
}

function warmFlagCache() {
  const queue = [...COUNTRIES];
  let cursor = 0;
  let loaded = 0;
  const workerCount = Math.min(10, queue.length);

  async function worker() {
    while (cursor < queue.length) {
      const country = queue[cursor++];
      await preloadFlag(country);
      loaded += 1;
      if (statusPill && activeMode === "flag" && loaded % 24 === 0) {
        statusPill.textContent = loaded + " / " + TOTAL + " flags cached";
      }
    }
  }

  Promise.all(Array.from({ length: workerCount }, worker)).then(() => {
    if (statusPill && current && activeMode === "flag") statusPill.textContent = "Flags cached";
  });
}

async function pickNext() {
  const token = ++flagSelectionToken;
  const available = COUNTRIES
    .map((country, index) => ({ country, index }))
    .filter(({ country }) => !flagGuessed.has(country.name));

  if (!available.length) {
    current = null;
    flagWrap.innerHTML = "";
    flagWrap.setAttribute("aria-label", "All countries complete");
    setFlagControlsEnabled(false);
    if (statusPill) statusPill.textContent = "World complete";
    setFeedback("Complete. All 196 countries have been guessed.", "good");
    return;
  }

  let choice = available[Math.floor(Math.random() * available.length)];
  if (available.length > 1) {
    while (choice.index === lastIndex) {
      choice = available[Math.floor(Math.random() * available.length)];
    }
  }
  const nextCountry = choice.country;
  setFlagControlsEnabled(false);
  if (statusPill && activeMode === "flag") statusPill.textContent = "Loading flag...";

  const loadedImage = await preloadFlag(nextCountry);
  if (token !== flagSelectionToken) return;

  current = nextCountry;
  lastIndex = choice.index;
  flagWrap.classList.remove("is-changing");
  void flagWrap.offsetWidth;
  flagWrap.classList.add("is-changing");
  flagWrap.innerHTML = '<img class="flag-image" src="' + current.src + '" alt="Flag to guess">';
  flagWrap.setAttribute("aria-label", "Flag to guess");
  if (statusPill && activeMode === "flag") statusPill.textContent = loadedImage ? "Mystery flag selected" : "Flag selected";
  setFlagControlsEnabled(true);
  if (activeMode === "flag") guessInput.focus();
}

function compareByContinentThenName(a, b) {
  const continentDelta = CONTINENT_ORDER.indexOf(a.continent) - CONTINENT_ORDER.indexOf(b.continent);
  if (continentDelta !== 0) return continentDelta;
  return a.name.localeCompare(b.name);
}

function renderGuessed() {
  const guessedSet = activeGuessedSet();
  const guessedCountries = COUNTRIES
    .filter((country) => guessedSet.has(country.name))
    .sort(compareByContinentThenName);
  const continentSlots = [...COUNTRIES].sort(compareByContinentThenName);
  const guessedCount = guessedCountries.length;
  const attempts = activeAttempts();
  const correctAnswers = activeCorrectAnswers();

  counter.textContent = guessedCount + " / " + TOTAL;
  remaining.textContent = String(TOTAL - guessedCount);
  streakStat.textContent = String(activeStreak());
  accuracyStat.textContent = attempts ? Math.round((correctAnswers / attempts) * 100) + "%" : "100%";

  if (activeMode === "map") {
    progressText.textContent = guessedCount + " mapped, " + (TOTAL - guessedCount) + " still blank";
    if (mapProgressText) mapProgressText.textContent = guessedCount + " guessed, " + (TOTAL - guessedCount) + " remaining";
  } else {
    progressText.textContent = guessedCount + " guessed, " + (TOTAL - guessedCount) + " still hidden";
    if (mapProgressText) mapProgressText.textContent = mapGuessed.size + " guessed, " + (TOTAL - mapGuessed.size) + " remaining";
  }

  const activeWidth = ((guessedCount / TOTAL) * 100).toFixed(1) + "%";
  progressFill.style.width = activeWidth;
  if (mapProgressFill) mapProgressFill.style.width = ((mapGuessed.size / TOTAL) * 100).toFixed(1) + "%";

  let activeContinent = "";
  guessedBody.innerHTML = continentSlots
    .flatMap((country, index) => {
      const rows = [];
      if (country.continent !== activeContinent) {
        activeContinent = country.continent;
        const continentCountries = continentSlots.filter((item) => item.continent === activeContinent);
        const continentGuessed = continentCountries.filter((item) => guessedSet.has(item.name)).length;
        rows.push('<tr class="continent-row"><td colspan="3">' + activeContinent + '<span> - ' + continentGuessed + ' / ' + continentCountries.length + '</span></td></tr>');
      }

      if (!guessedSet.has(country.name)) {
        rows.push('<tr class="empty-slot"><td class="slot-number">' + (index + 1) + '</td><td aria-label="Blank country slot"></td><td aria-label="Blank code slot"></td></tr>');
        return rows;
      }

      rows.push('<tr><td class="slot-number">' + (index + 1) + '</td><td><span class="mini-flag" aria-hidden="true"><img src="' + country.src + '" alt=""></span>' + country.name + '</td><td>' + country.code + '</td></tr>');
      return rows;
    })
    .join("");
}

function checkFlagGuess({ showWrong = false, fullNameOnly = false } = {}) {
  if (!current) return;

  const exactAnswer = normalizeExactName(guessInput.value);
  const answer = normalize(guessInput.value);
  if (!answer) return;

  const accepted = aliasesFor(current);
  if ((fullNameOnly && exactAnswer === fullNameFor(current)) || (!fullNameOnly && accepted.has(answer))) {
    flagGuessed.add(current.name);
    flagStreak += 1;
    flagAttempts += 1;
    flagCorrectAnswers += 1;
    guessInput.value = "";
    renderGuessed();
    setFeedback("Correct: " + current.name + ". Streak now " + flagStreak + ".", "good");
    pickNext();
  } else if (showWrong) {
    flagAttempts += 1;
    flagStreak = 0;
    renderGuessed();
    setFeedback("Not quite. Streak reset, but the flag is still live.", "bad");
    guessInput.select();
  }
}

function loadMapData() {
  if (window.WORLD_COUNTRY_FEATURES) return Promise.resolve(window.WORLD_COUNTRY_FEATURES);
  if (mapLoadPromise) return mapLoadPromise;

  mapLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "data/world-map.js?v=" + encodeURIComponent(ASSET_VERSION);
    script.onload = () => resolve(window.WORLD_COUNTRY_FEATURES || []);
    script.onerror = () => reject(new Error("Map data failed to load"));
    document.head.appendChild(script);
  });

  return mapLoadPromise;
}

function projectPoint(point) {
  const lon = point[0];
  const lat = point[1];
  return [
    ((lon + 180) / 360) * MAP_WIDTH,
    ((90 - lat) / 180) * MAP_HEIGHT,
  ];
}

function ringToPath(ring) {
  return ring
    .map((point, index) => {
      const projected = projectPoint(point);
      const command = index === 0 ? "M" : "L";
      return command + projected[0].toFixed(2) + " " + projected[1].toFixed(2);
    })
    .join(" ") + " Z";
}

function geometryToPath(geometry) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map(ringToPath).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .flatMap((polygon) => polygon.map(ringToPath))
      .join(" ");
  }
  return "";
}

function eachGeometryPoint(geometry, callback) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  polygons.forEach((polygon) => {
    polygon.forEach((ring) => {
      ring.forEach(callback);
    });
  });
}

function geometryMeta(geometry, code) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  eachGeometryPoint(geometry, (point) => {
    const projected = projectPoint(point);
    minX = Math.min(minX, projected[0]);
    minY = Math.min(minY, projected[1]);
    maxX = Math.max(maxX, projected[0]);
    maxY = Math.max(maxY, projected[1]);
  });

  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    tiny: MICROSTATE_CODES.has(code) || width < 9 || height < 9,
  };
}

async function initWorldMap() {
  if (mapReady) {
    syncMapHighlights();
    updateMapViewBox();
    return;
  }

  try {
    if (mapStatusPill) mapStatusPill.textContent = "Loading map...";
    const features = await loadMapData();
    if (!features.length) throw new Error("No map features found");

    const countryPaths = [];
    const markerDots = [];
    const missingDots = [];
    mapPathsByCode.clear();
    mapMarkersByCode.clear();
    mapMissingDotsByCode.clear();
    mapFeatureMetaByCode.clear();

    features.forEach((feature) => {
      const path = geometryToPath(feature.geometry);
      const meta = geometryMeta(feature.geometry, feature.code);
      mapFeatureMetaByCode.set(feature.code, meta);
      countryPaths.push('<path class="country-shape" data-code="' + feature.code + '" d="' + path + '"><title>' + feature.name + '</title></path>');
      missingDots.push('<circle class="missing-country-dot" data-code="' + feature.code + '" cx="' + meta.x.toFixed(2) + '" cy="' + meta.y.toFixed(2) + '" r="4.5"><title>' + feature.name + ' missing</title></circle>');
      if (meta.tiny) {
        markerDots.push('<circle class="country-marker" data-code="' + feature.code + '" cx="' + meta.x.toFixed(2) + '" cy="' + meta.y.toFixed(2) + '" r="4"><title>' + feature.name + '</title></circle>');
      }
    });

    worldMapWrap.innerHTML =
      '<svg class="world-map" viewBox="0 0 ' + MAP_WIDTH + " " + MAP_HEIGHT + '" role="img" aria-label="World country map" preserveAspectRatio="xMidYMid meet">' +
      '<rect class="map-ocean" width="' + MAP_WIDTH + '" height="' + MAP_HEIGHT + '"></rect>' +
      '<g class="map-grid" aria-hidden="true">' + buildMapGrid() + '</g>' +
      '<g class="map-countries">' + countryPaths.join("") + '</g>' +
      '<g class="map-markers">' + markerDots.join("") + '</g>' +
      '<g class="map-missing-dots" aria-hidden="true">' + missingDots.join("") + '</g>' +
      '</svg>';

    worldMapWrap.querySelectorAll(".country-shape").forEach((path) => {
      mapPathsByCode.set(path.dataset.code, path);
    });
    worldMapWrap.querySelectorAll(".country-marker").forEach((marker) => {
      mapMarkersByCode.set(marker.dataset.code, marker);
    });
    worldMapWrap.querySelectorAll(".missing-country-dot").forEach((dot) => {
      mapMissingDotsByCode.set(dot.dataset.code, dot);
    });

    mapReady = true;
    if (mapStatusPill) mapStatusPill.textContent = "World map ready";
    if (mapLoadedText) mapLoadedText.textContent = TOTAL + " countries mapped";
    updateMapViewBox();
    syncMapHighlights();
  } catch (error) {
    worldMapWrap.innerHTML = '<div class="map-loading">Map data could not load.</div>';
    if (mapStatusPill) mapStatusPill.textContent = "Map unavailable";
    setMapFeedback("The country list still works, but the map data could not load.", "bad");
  }
}

function updateMapViewBox() {
  const svg = worldMapWrap.querySelector(".world-map");
  if (!svg) return;

  const width = MAP_WIDTH / mapZoom;
  const height = MAP_HEIGHT / mapZoom;
  const x = (MAP_WIDTH - width) / 2;
  const y = (MAP_HEIGHT - height) / 2;
  svg.setAttribute("viewBox", [x, y, width, height].map((value) => value.toFixed(2)).join(" "));

  if (mapZoomReadout) mapZoomReadout.textContent = Math.round(mapZoom * 100) + "%";
  if (mapZoomOutButton) mapZoomOutButton.disabled = mapZoom <= MAP_MIN_ZOOM;
  if (mapZoomInButton) mapZoomInButton.disabled = mapZoom >= MAP_MAX_ZOOM;
}

function setMapZoom(nextZoom) {
  mapZoom = clamp(nextZoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  updateMapViewBox();
}

function buildMapGrid() {
  const lines = [];
  for (let lon = -120; lon <= 120; lon += 60) {
    const x = ((lon + 180) / 360) * MAP_WIDTH;
    lines.push('<line x1="' + x.toFixed(2) + '" y1="0" x2="' + x.toFixed(2) + '" y2="' + MAP_HEIGHT + '"></line>');
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * MAP_HEIGHT;
    lines.push('<line x1="0" y1="' + y.toFixed(2) + '" x2="' + MAP_WIDTH + '" y2="' + y.toFixed(2) + '"></line>');
  }
  return lines.join("");
}

function syncMapHighlights() {
  mapPathsByCode.forEach((path, code) => {
    const country = COUNTRIES.find((item) => item.code === code);
    path.classList.toggle("is-guessed", Boolean(country && mapGuessed.has(country.name)));
  });
  mapMarkersByCode.forEach((marker, code) => {
    const country = COUNTRIES.find((item) => item.code === code);
    marker.classList.toggle("is-guessed", Boolean(country && mapGuessed.has(country.name)));
  });
  syncMissingCountryDots();
}

function syncMissingCountryDots() {
  mapMissingDotsByCode.forEach((dot, code) => {
    const country = COUNTRIES.find((item) => item.code === code);
    const shouldShow = Boolean(missingOverlayVisible && country && !mapGuessed.has(country.name));
    dot.classList.toggle("is-visible", shouldShow);
  });

  if (missingCountriesButton) {
    missingCountriesButton.setAttribute("aria-pressed", String(missingOverlayVisible));
    missingCountriesButton.textContent = missingOverlayVisible ? "Hide missing dots" : "Show missing dots";
  }
}

function countryFromMapAnswer(value) {
  const answer = normalizeExactName(value);
  if (!answer) return null;

  return COUNTRIES.find((country) => {
    if (mapGuessed.has(country.name)) return false;
    return exactNamesFor(country).has(answer);
  }) || null;
}

function revealMapCountry(country) {
  mapGuessed.add(country.name);
  mapStreak += 1;
  mapAttempts += 1;
  mapCorrectAnswers += 1;
  mapGuessInput.value = "";
  renderGuessed();
  syncMapHighlights();

  const guessedCount = mapGuessed.size;
  if (guessedCount === TOTAL) {
    setMapFeedback("Complete. All 196 countries are highlighted.", "good");
    if (mapStatusPill) mapStatusPill.textContent = "World complete";
    mapGuessInput.disabled = true;
    return;
  }

  setMapFeedback(country.name + " highlighted. " + (TOTAL - guessedCount) + " countries left.", "good");
  if (mapStatusPill) mapStatusPill.textContent = country.name + " found";
}

function checkMapInput({ showWrong = false } = {}) {
  const country = countryFromMapAnswer(mapGuessInput.value);
  if (country) {
    revealMapCountry(country);
    return;
  }

  if (showWrong && normalizeExactName(mapGuessInput.value)) {
    mapAttempts += 1;
    mapStreak = 0;
    renderGuessed();
    setMapFeedback("Not on the board yet. Try another country name.", "bad");
    mapGuessInput.select();
  }
}

modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

guessInput.addEventListener("input", () => {
  checkFlagGuess({ fullNameOnly: true });
});

guessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  checkFlagGuess({ showWrong: true });
});

hintButton.addEventListener("click", () => {
  if (!current) return;
  if (statusPill) statusPill.textContent = "Hint unlocked";
  const letterCount = current.name.replace(/[^A-Za-z]/g, "").length;
  const wordCount = current.name.split(/\s+/).filter(Boolean).length;
  const wordLabel = wordCount === 1 ? "word" : "words";
  setFeedback("Hint: starts with " + current.name.charAt(0) + ", " + letterCount + " letters, " + wordCount + " " + wordLabel + ".");
});

skipButton.addEventListener("click", () => {
  flagStreak = 0;
  renderGuessed();
  setFeedback("Skipped. Streak reset - new flag incoming.");
  pickNext();
});

resetButton.addEventListener("click", () => {
  flagGuessed.clear();
  flagStreak = 0;
  flagAttempts = 0;
  flagCorrectAnswers = 0;
  guessInput.value = "";
  setFlagControlsEnabled(true);
  renderGuessed();
  if (statusPill) statusPill.textContent = "Mystery flag selected";
  setFeedback("Game reset. Fresh flags, fresh glory.");
  pickNext();
});

mapGuessInput.addEventListener("input", () => {
  checkMapInput();
});

mapGuessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  checkMapInput({ showWrong: true });
});

mapResetButton.addEventListener("click", () => {
  mapGuessed.clear();
  mapStreak = 0;
  mapAttempts = 0;
  mapCorrectAnswers = 0;
  mapGuessInput.disabled = false;
  mapGuessInput.value = "";
  renderGuessed();
  syncMapHighlights();
  if (mapStatusPill) mapStatusPill.textContent = "World map ready";
  setMapFeedback("Map reset. Start anywhere on the globe.");
  mapGuessInput.focus({ preventScroll: true });
});

mapZoomOutButton.addEventListener("click", () => {
  setMapZoom(mapZoom / MAP_ZOOM_STEP);
});

mapZoomInButton.addEventListener("click", () => {
  setMapZoom(mapZoom * MAP_ZOOM_STEP);
});

mapZoomResetButton.addEventListener("click", () => {
  setMapZoom(1);
});

missingCountriesButton.addEventListener("click", () => {
  missingOverlayVisible = !missingOverlayVisible;
  syncMissingCountryDots();
  const missingCount = TOTAL - mapGuessed.size;
  setMapFeedback(missingOverlayVisible ? missingCount + " missing countries marked on the map." : "Missing country dots hidden.");
});

if (TOTAL !== 196) {
  setFeedback("Dataset error: expected 196 countries, found " + TOTAL + ".", "bad");
} else {
  renderGuessed();
  pickNext();
  warmFlagCache();
}
