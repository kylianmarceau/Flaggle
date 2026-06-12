import { el } from "./createElement";

const COLOR_ATTRS = ["fill", "stroke"] as const;
const COLOR_PATTERN = /#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|\b(?:white|black|red|green|blue|yellow|orange|purple|gold|silver|gray|grey)\b/g;
const HIDDEN_FILL = "rgba(255,255,255,0.055)";
const HIDDEN_STROKE = "rgba(255,255,255,0.14)";

export interface FlagColorRevealView {
  readonly element: HTMLElement;
  readonly reset: (targetSrc: string) => void;
  readonly addGuess: (flagSrc: string) => void;
}

type SvgData = {
  readonly doc: Document;
  readonly styles: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly colors: ReadonlySet<string>;
};

const svgCache = new Map<string, Promise<SvgData | null>>();

const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: "#000000",
  blue: "#0000ff",
  gold: "#ffd700",
  gray: "#808080",
  green: "#008000",
  grey: "#808080",
  orange: "#ffa500",
  purple: "#800080",
  red: "#ff0000",
  silver: "#c0c0c0",
  white: "#ffffff",
  yellow: "#ffff00",
};

function canonicalColor(value: string | null): string | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (raw === "none" || raw === "transparent" || raw.startsWith("url(") || raw === "currentcolor") return null;
  if (NAMED_COLORS[raw]) return NAMED_COLORS[raw];
  if (raw.startsWith("#")) {
    const hex = raw.slice(1);
    if (hex.length === 3) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    if (hex.length === 4) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    if (hex.length >= 6) return `#${hex.slice(0, 6)}`;
  }
  const rgb = raw.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1]!.split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return `#${parts.slice(0, 3).map((part) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return null;
}

function parseStyleDeclarations(style: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const declaration of style.split(";")) {
    const [property, ...rest] = declaration.split(":");
    const value = rest.join(":").trim();
    if (property && value) out.set(property.trim().toLowerCase(), value);
  }
  return out;
}

function parseClassStyles(doc: Document): Map<string, Map<string, string>> {
  const styles = new Map<string, Map<string, string>>();
  for (const style of Array.from(doc.querySelectorAll("style"))) {
    const text = style.textContent ?? "";
    const rules = text.matchAll(/\.([A-Za-z0-9_-]+)\s*\{([^}]+)\}/g);
    for (const rule of rules) {
      styles.set(rule[1]!, parseStyleDeclarations(rule[2]!));
    }
  }
  return styles;
}

function classDeclaration(element: Element, styles: ReadonlyMap<string, ReadonlyMap<string, string>>, attr: "fill" | "stroke"): string | null {
  for (const className of Array.from(element.classList)) {
    const value = styles.get(className)?.get(attr);
    if (value) return value;
  }
  return null;
}

function colorFor(element: Element, styles: ReadonlyMap<string, ReadonlyMap<string, string>>, attr: "fill" | "stroke"): string | null {
  const direct = element.getAttribute(attr);
  if (direct) return canonicalColor(direct);
  const inline = element.getAttribute("style");
  if (inline) {
    const fromStyle = parseStyleDeclarations(inline).get(attr);
    if (fromStyle) return canonicalColor(fromStyle);
  }
  return canonicalColor(classDeclaration(element, styles, attr));
}

function collectColors(doc: Document, styles: ReadonlyMap<string, ReadonlyMap<string, string>>): Set<string> {
  const colors = new Set<string>();
  for (const element of Array.from(doc.querySelectorAll("*"))) {
    for (const attr of COLOR_ATTRS) {
      const color = colorFor(element, styles, attr);
      if (color) colors.add(color);
    }
    const inline = element.getAttribute("style");
    if (inline) {
      for (const match of inline.matchAll(COLOR_PATTERN)) {
        const color = canonicalColor(match[0]);
        if (color) colors.add(color);
      }
    }
  }
  for (const style of Array.from(doc.querySelectorAll("style"))) {
    for (const match of (style.textContent ?? "").matchAll(COLOR_PATTERN)) {
      const color = canonicalColor(match[0]);
      if (color) colors.add(color);
    }
  }
  return colors;
}

async function loadSvg(src: string): Promise<SvgData | null> {
  const cached = svgCache.get(src);
  if (cached) return cached;
  const promise = fetch(src)
    .then(async (response) => {
      if (!response.ok) return null;
      const text = await response.text();
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      if (doc.querySelector("parsererror")) return null;
      const styles = parseClassStyles(doc);
      return { doc, styles, colors: collectColors(doc, styles) };
    })
    .catch(() => null);
  svgCache.set(src, promise);
  return promise;
}

function hideUnrevealedColors(data: SvgData, revealedColors: ReadonlySet<string>): string {
  const clone = data.doc.documentElement.cloneNode(true) as SVGElement;
  const cloneDoc = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg", null);
  const imported = cloneDoc.importNode(clone, true);
  cloneDoc.replaceChild(imported, cloneDoc.documentElement);
  imported.setAttribute("class", `${imported.getAttribute("class") ?? ""} flag-color-svg`.trim());

  for (const element of Array.from(imported.querySelectorAll("*"))) {
    for (const attr of COLOR_ATTRS) {
      const color = colorFor(element, data.styles, attr);
      if (!color || revealedColors.has(color)) continue;
      (element as SVGElement).style.setProperty(attr, attr === "fill" ? HIDDEN_FILL : HIDDEN_STROKE, "important");
    }
  }

  return new XMLSerializer().serializeToString(imported);
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createFlagColorRevealView(): FlagColorRevealView {
  const image = el("img", { className: "flag-color-reveal-image", attrs: { alt: "Hidden target flag" } });
  const meta = el("p", { className: "flag-color-reveal-meta", text: "Guess flags to reveal shared colours." });
  const element = el("div", { className: "flag-color-reveal", children: [image, meta] });
  const revealedColors = new Set<string>();
  let targetSrc = "";
  let renderToken = 0;

  async function render(): Promise<void> {
    const token = ++renderToken;
    if (!targetSrc) return;
    const target = await loadSvg(targetSrc);
    if (token !== renderToken) return;
    if (!target) {
      image.removeAttribute("src");
      meta.textContent = "Unable to load the target flag.";
      return;
    }
    image.src = svgDataUrl(hideUnrevealedColors(target, revealedColors));
    meta.textContent = revealedColors.size === 0 ? "Guess flags to reveal shared colours." : `${revealedColors.size} target colour${revealedColors.size === 1 ? "" : "s"} revealed`;
  }

  return {
    element,
    reset(nextTargetSrc: string): void {
      targetSrc = nextTargetSrc;
      revealedColors.clear();
      void render();
    },
    addGuess(flagSrc: string): void {
      void loadSvg(flagSrc).then((guess) => {
        if (!guess) return;
        for (const color of guess.colors) revealedColors.add(color);
        void render();
      });
    },
  };
}
