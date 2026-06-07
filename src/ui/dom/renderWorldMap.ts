import type { CountryId, CountryIndex } from "../../core/countries";
import type { WorldCountryFeature, WorldMapPolygon, WorldMapPosition } from "../../core/map";

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 500;
const VIEWBOX = `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`;

export interface WorldMapView {
  readonly element: HTMLElement;
  readonly highlightedCount: HTMLElement;
  readonly remainingCount: HTMLElement;
  readonly pathByCountryId: ReadonlyMap<CountryId, SVGPathElement>;
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

function project([longitude, latitude]: WorldMapPosition): readonly [number, number] {
  return [((longitude + 180) / 360) * VIEWBOX_WIDTH, ((90 - latitude) / 180) * VIEWBOX_HEIGHT];
}

function formatPoint(point: WorldMapPosition): string {
  const [x, y] = project(point);
  return `${x.toFixed(3)} ${y.toFixed(3)}`;
}

function polygonToPath(polygon: WorldMapPolygon): string {
  return polygon
    .map((ring) => ring.map((point, index) => `${index === 0 ? "M" : "L"} ${formatPoint(point)}`).join(" ") + " Z")
    .join(" ");
}

function geometryToPath(feature: WorldCountryFeature): string {
  if (feature.geometry.type === "Polygon") return polygonToPath(feature.geometry.coordinates);
  return feature.geometry.coordinates.map(polygonToPath).join(" ");
}

export function createWorldMapView(features: readonly WorldCountryFeature[], countryIndex: CountryIndex): WorldMapView {
  const svg = createSvgElement("svg");
  svg.setAttribute("viewBox", VIEWBOX);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Unlabeled world map");
  svg.setAttribute("class", "world-map-svg");

  const pathByCountryId = new Map<CountryId, SVGPathElement>();

  for (const feature of features) {
    const country = countryIndex.byCode.get(feature.code.toUpperCase());
    const path = createSvgElement("path");
    path.setAttribute("d", geometryToPath(feature));
    path.setAttribute("vector-effect", "non-scaling-stroke");
    path.classList.add("world-map-country");

    if (country) {
      path.dataset.countryId = String(country.id);
      pathByCountryId.set(country.id, path);
    } else {
      path.classList.add("world-map-country-unplayable");
    }

    svg.append(path);
  }

  const highlightedCount = document.createElement("strong");
  highlightedCount.textContent = "0";
  const remainingCount = document.createElement("strong");
  remainingCount.textContent = String(countryIndex.countries.length);

  const element = document.createElement("div");
  element.className = "world-map-panel";
  element.append(
    svg,
    document.createElement("div"),
  );
  const meta = element.lastElementChild as HTMLElement;
  meta.className = "world-map-meta";
  meta.append(
    document.createElement("span"),
    document.createElement("span"),
  );
  meta.children[0]!.append("Found ", highlightedCount);
  meta.children[1]!.append("Left ", remainingCount);

  return { element, highlightedCount, remainingCount, pathByCountryId };
}

export function updateWorldMapView(view: WorldMapView, guessedCountryIds: ReadonlySet<CountryId>, totalCountries: number): void {
  for (const [countryId, path] of view.pathByCountryId.entries()) {
    path.classList.toggle("is-guessed", guessedCountryIds.has(countryId));
  }

  view.highlightedCount.textContent = String(guessedCountryIds.size);
  view.remainingCount.textContent = String(Math.max(0, totalCountries - guessedCountryIds.size));
}
