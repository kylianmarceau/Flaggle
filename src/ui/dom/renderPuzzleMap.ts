import type { Continent, Country, CountryId, CountryIndex } from "../../core/countries";
import type { WorldCountryFeature, WorldMapPolygon, WorldMapPosition } from "../../core/map";

const SVG_NS = "http://www.w3.org/2000/svg";
const BOARD_WIDTH = 820;
const BOARD_HEIGHT = 560;
const BOARD_PADDING = 34;
const PIECE_SNAP_DISTANCE = 28;
const MINI_PATH_PADDING_RATIO = 0.16;

type Point = readonly [number, number];

type ProjectTransform = (point: WorldMapPosition) => Point;

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

interface PuzzlePiece {
  readonly country: Country;
  readonly feature: WorldCountryFeature;
  readonly path: SVGPathElement;
  readonly card: HTMLButtonElement;
  readonly correctCenter: Point;
  dx: number;
  dy: number;
  visible: boolean;
  placed: boolean;
}

interface ActiveDrag {
  readonly piece: PuzzlePiece;
  readonly pointerOffsetX: number;
  readonly pointerOffsetY: number;
  readonly abortController: AbortController;
}

export interface PuzzleMapProgress {
  readonly placedCount: number;
  readonly totalCount: number;
  readonly lastCountry: Country | null;
  readonly complete: boolean;
}

export interface PuzzleMapViewOptions {
  readonly signal?: AbortSignal;
  readonly onFirstPlacement?: () => void;
  readonly onProgress?: (progress: PuzzleMapProgress) => void;
  readonly onComplete?: (progress: PuzzleMapProgress) => void;
}

export interface PuzzleMapView {
  readonly element: HTMLElement;
  readonly setContinent: (continent: Continent) => void;
  readonly reset: () => void;
  readonly getState: () => PuzzleMapProgress;
  readonly destroy: () => void;
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

function project([longitude, latitude]: WorldMapPosition): Point {
  return [((longitude + 180) / 360) * 1000, ((90 - latitude) / 180) * 500];
}

function expandBounds(bounds: Bounds | null, [x, y]: Point): Bounds {
  if (!bounds) return { minX: x, minY: y, maxX: x, maxY: y };
  return {
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
  };
}

function featureBounds(feature: WorldCountryFeature, transform: ProjectTransform = project): Bounds | null {
  let bounds: Bounds | null = null;
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const point of ring) bounds = expandBounds(bounds, transform(point));
    }
  }

  return bounds;
}

function mergeBounds(features: readonly WorldCountryFeature[]): Bounds | null {
  let bounds: Bounds | null = null;

  for (const feature of features) {
    const nextBounds = featureBounds(feature);
    if (!nextBounds) continue;
    bounds = expandBounds(bounds, [nextBounds.minX, nextBounds.minY]);
    bounds = expandBounds(bounds, [nextBounds.maxX, nextBounds.maxY]);
  }

  return bounds;
}

function boundsCenter(bounds: Bounds): Point {
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
}

function createContinentTransform(bounds: Bounds): ProjectTransform {
  const rawWidth = Math.max(1, bounds.maxX - bounds.minX);
  const rawHeight = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min((BOARD_WIDTH - BOARD_PADDING * 2) / rawWidth, (BOARD_HEIGHT - BOARD_PADDING * 2) / rawHeight);
  const contentWidth = rawWidth * scale;
  const contentHeight = rawHeight * scale;
  const offsetX = (BOARD_WIDTH - contentWidth) / 2;
  const offsetY = (BOARD_HEIGHT - contentHeight) / 2;

  return (point) => {
    const [x, y] = project(point);
    return [offsetX + (x - bounds.minX) * scale, offsetY + (y - bounds.minY) * scale];
  };
}

function formatPoint(point: WorldMapPosition, transform: ProjectTransform): string {
  const [x, y] = transform(point);
  return `${x.toFixed(3)} ${y.toFixed(3)}`;
}

function polygonToPath(polygon: WorldMapPolygon, transform: ProjectTransform): string {
  return polygon
    .map((ring) => ring.map((point, index) => `${index === 0 ? "M" : "L"} ${formatPoint(point, transform)}`).join(" ") + " Z")
    .join(" ");
}

function geometryToPath(feature: WorldCountryFeature, transform: ProjectTransform): string {
  if (feature.geometry.type === "Polygon") return polygonToPath(feature.geometry.coordinates, transform);
  return feature.geometry.coordinates.map((polygon) => polygonToPath(polygon, transform)).join(" ");
}

function pointerToSvgPosition(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return [BOARD_WIDTH / 2, BOARD_HEIGHT / 2];

  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const transformed = point.matrixTransform(ctm.inverse());
  return [transformed.x, transformed.y];
}

function shuffle<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex]!, shuffled[index]!];
  }
  return shuffled;
}

function updatePieceTransform(piece: PuzzlePiece): void {
  piece.path.setAttribute("transform", `translate(${piece.dx.toFixed(3)} ${piece.dy.toFixed(3)})`);
}

function pieceProgress(pieces: readonly PuzzlePiece[], lastCountry: Country | null = null): PuzzleMapProgress {
  const placedCount = pieces.filter((piece) => piece.placed).length;
  return {
    placedCount,
    totalCount: pieces.length,
    lastCountry,
    complete: pieces.length > 0 && placedCount >= pieces.length,
  };
}

function createMiniSvg(feature: WorldCountryFeature, countryName: string): SVGSVGElement {
  const svg = createSvgElement("svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "puzzle-piece-card-svg");

  const bounds = featureBounds(feature);
  if (!bounds) return svg;

  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const padding = Math.max(width, height) * MINI_PATH_PADDING_RATIO;
  svg.setAttribute("viewBox", `${(bounds.minX - padding).toFixed(3)} ${(bounds.minY - padding).toFixed(3)} ${(width + padding * 2).toFixed(3)} ${(height + padding * 2).toFixed(3)}`);

  const title = createSvgElement("title");
  title.textContent = countryName;
  const path = createSvgElement("path");
  path.setAttribute("d", geometryToPath(feature, project));
  path.setAttribute("vector-effect", "non-scaling-stroke");
  path.classList.add("puzzle-piece-card-path");
  svg.append(title, path);
  return svg;
}

function signalAny(signals: readonly AbortSignal[]): AbortSignal | undefined {
  const filtered = signals.filter(Boolean);
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];

  const controller = new AbortController();
  for (const signal of filtered) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export function createPuzzleMapView(
  features: readonly WorldCountryFeature[],
  countryIndex: CountryIndex,
  initialContinent: Continent,
  options: PuzzleMapViewOptions = {},
): PuzzleMapView {
  const controller = new AbortController();
  const signal = signalAny([controller.signal, ...(options.signal ? [options.signal] : [])]) ?? controller.signal;
  const featureByCountryId = new Map<CountryId, WorldCountryFeature>();

  for (const feature of features) {
    const country = countryIndex.byCode.get(feature.code.toUpperCase());
    if (country) featureByCountryId.set(country.id, feature);
  }

  const element = document.createElement("div");
  element.className = "puzzle-map-panel";

  const boardShell = document.createElement("div");
  boardShell.className = "puzzle-board-shell";

  const svg = createSvgElement("svg");
  svg.setAttribute("class", "puzzle-board-svg");
  svg.setAttribute("viewBox", `0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Continent puzzle board. Drag country cutouts into their matching outlines.");

  const continentLayer = createSvgElement("g");
  continentLayer.setAttribute("class", "puzzle-continent-layer");
  const outlineLayer = createSvgElement("g");
  outlineLayer.setAttribute("class", "puzzle-target-layer");
  const pieceLayer = createSvgElement("g");
  pieceLayer.setAttribute("class", "puzzle-piece-layer");
  svg.append(continentLayer, outlineLayer, pieceLayer);

  const tray = document.createElement("div");
  tray.className = "puzzle-piece-tray";
  tray.setAttribute("aria-label", "Country puzzle pieces");

  const borderToggleLabel = document.createElement("label");
  borderToggleLabel.className = "puzzle-border-toggle";
  const borderToggle = document.createElement("input");
  borderToggle.type = "checkbox";
  borderToggle.className = "puzzle-border-toggle-input";
  borderToggle.checked = false;
  const borderToggleText = document.createElement("span");
  borderToggleText.textContent = "Show country borders";
  borderToggleLabel.append(borderToggle, borderToggleText);

  const hint = document.createElement("p");
  hint.className = "puzzle-map-hint";
  hint.textContent = "Tip: drag a cutout near its outline and it will snap into place. Turn on borders for an easier guide.";

  boardShell.append(svg, borderToggleLabel, hint);
  element.append(boardShell, tray);

  let continent: Continent = initialContinent;
  let showCountryBorders = false;
  let pieces: PuzzlePiece[] = [];
  let activeDrag: ActiveDrag | null = null;
  let lastCountry: Country | null = null;

  function setShowCountryBorders(nextValue: boolean): void {
    showCountryBorders = nextValue;
    borderToggle.checked = showCountryBorders;
    element.classList.toggle("show-country-borders", showCountryBorders);
  }

  borderToggle.addEventListener("change", () => setShowCountryBorders(borderToggle.checked), { signal });
  setShowCountryBorders(false);

  function currentProgress(country: Country | null = lastCountry): PuzzleMapProgress {
    return pieceProgress(pieces, country);
  }

  function emitProgress(country: Country | null = lastCountry): PuzzleMapProgress {
    const progress = currentProgress(country);
    options.onProgress?.(progress);
    return progress;
  }

  function cancelActiveDrag(): void {
    activeDrag?.abortController.abort();
    activeDrag?.piece.path.classList.remove("is-dragging");
    activeDrag = null;
  }

  function finishDrag(): void {
    if (!activeDrag) return;

    const piece = activeDrag.piece;
    cancelActiveDrag();

    const distanceFromHome = Math.hypot(piece.dx, piece.dy);
    if (distanceFromHome > PIECE_SNAP_DISTANCE) {
      piece.path.classList.add("is-loose");
      piece.card.classList.add("is-in-play");
      return;
    }

    piece.dx = 0;
    piece.dy = 0;
    piece.visible = true;
    piece.placed = true;
    updatePieceTransform(piece);
    piece.path.classList.remove("is-loose");
    piece.path.classList.add("is-placed");
    piece.card.hidden = true;
    lastCountry = piece.country;
    options.onFirstPlacement?.();
    const progress = emitProgress(piece.country);
    if (progress.complete) options.onComplete?.(progress);
  }

  function moveDrag(event: PointerEvent): void {
    if (!activeDrag) return;
    event.preventDefault();
    const piece = activeDrag.piece;
    const [x, y] = pointerToSvgPosition(svg, event.clientX, event.clientY);
    piece.dx = x - activeDrag.pointerOffsetX - piece.correctCenter[0];
    piece.dy = y - activeDrag.pointerOffsetY - piece.correctCenter[1];
    updatePieceTransform(piece);
  }

  function startDrag(piece: PuzzlePiece, event: PointerEvent): void {
    if (piece.placed) return;
    event.preventDefault();
    event.stopPropagation();
    cancelActiveDrag();

    const [x, y] = pointerToSvgPosition(svg, event.clientX, event.clientY);
    if (!piece.visible) {
      piece.visible = true;
      piece.dx = x - piece.correctCenter[0];
      piece.dy = y - piece.correctCenter[1];
      piece.path.style.display = "";
      updatePieceTransform(piece);
      piece.card.classList.add("is-in-play");
    }

    pieceLayer.append(piece.path);
    piece.path.classList.add("is-dragging");
    piece.path.classList.remove("is-loose");

    const abortController = new AbortController();
    const dragSignal = signalAny([abortController.signal, controller.signal, ...(options.signal ? [options.signal] : [])]) ?? abortController.signal;
    activeDrag = {
      piece,
      pointerOffsetX: x - (piece.correctCenter[0] + piece.dx),
      pointerOffsetY: y - (piece.correctCenter[1] + piece.dy),
      abortController,
    };

    window.addEventListener("pointermove", moveDrag, { signal: dragSignal });
    window.addEventListener("pointerup", finishDrag, { signal: dragSignal, once: true });
    window.addEventListener("pointercancel", finishDrag, { signal: dragSignal, once: true });
  }

  function buildContinent(nextContinent: Continent): void {
    cancelActiveDrag();
    continent = nextContinent;
    lastCountry = null;
    pieces = [];
    continentLayer.replaceChildren();
    outlineLayer.replaceChildren();
    pieceLayer.replaceChildren();
    tray.replaceChildren();

    const countries = countryIndex.countries.filter((country) => country.continent === continent && featureByCountryId.has(country.id));
    const continentFeatures = countries.map((country) => featureByCountryId.get(country.id)!).filter(Boolean);
    const bounds = mergeBounds(continentFeatures);
    if (!bounds) {
      const empty = document.createElement("p");
      empty.className = "puzzle-tray-empty";
      empty.textContent = "No outline data found for this continent yet.";
      tray.append(empty);
      return;
    }

    const transform = createContinentTransform(bounds);

    for (const country of countries) {
      const feature = featureByCountryId.get(country.id)!;
      const pathData = geometryToPath(feature, transform);
      const localBounds = featureBounds(feature, transform);
      if (!localBounds) continue;
      const center = boundsCenter(localBounds);

      const silhouette = createSvgElement("path");
      silhouette.setAttribute("d", pathData);
      silhouette.classList.add("puzzle-continent-silhouette-country");
      continentLayer.append(silhouette);

      const target = createSvgElement("path");
      target.setAttribute("d", pathData);
      target.setAttribute("vector-effect", "non-scaling-stroke");
      target.classList.add("puzzle-target-country");
      outlineLayer.append(target);

      const piecePath = createSvgElement("path");
      piecePath.setAttribute("d", pathData);
      piecePath.setAttribute("vector-effect", "non-scaling-stroke");
      piecePath.dataset.countryId = String(country.id);
      piecePath.classList.add("puzzle-country-piece");
      piecePath.style.display = "none";
      piecePath.setAttribute("aria-label", country.name);
      pieceLayer.append(piecePath);

      const card = document.createElement("button");
      card.type = "button";
      card.className = "puzzle-piece-card";
      card.setAttribute("aria-label", `Drag ${country.name}`);
      const name = document.createElement("span");
      name.className = "puzzle-piece-card-name";
      name.textContent = country.name;
      card.append(createMiniSvg(feature, country.name), name);

      const piece: PuzzlePiece = { country, feature, path: piecePath, card, correctCenter: center, dx: 0, dy: 0, visible: false, placed: false };
      pieces.push(piece);

      piecePath.addEventListener("pointerdown", (event) => startDrag(piece, event), { signal });
      card.addEventListener("pointerdown", (event) => startDrag(piece, event), { signal });
    }

    for (const piece of shuffle(pieces)) tray.append(piece.card);
  }

  buildContinent(initialContinent);

  return {
    element,
    setContinent: (nextContinent) => buildContinent(nextContinent),
    reset: () => buildContinent(continent),
    getState: () => currentProgress(),
    destroy: () => {
      cancelActiveDrag();
      controller.abort();
    },
  };
}
