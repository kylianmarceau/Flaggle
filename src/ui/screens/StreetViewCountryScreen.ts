import type { Country, CountryId, CountryIndex } from "../../core/countries";
import { isPromptGameModeId, isStreetViewGameModeId, isWorldMapGameModeId, type GameModeId } from "../../core/gameModes";
import { streetViewCountryRounds, type StreetViewCountryRound, type StreetViewFrame } from "../../core/streetview";
import { submitCountryGuess } from "../../core/map";
import type { Screen } from "../../app/router";
import { el } from "../dom/createElement";
import { createGameModeDropdown } from "../dom/gameModeDropdown";
import { createFeedbackView, showFeedback } from "../dom/renderFeedback";

export interface StreetViewCountryScreenOptions {
  readonly countryIndex: CountryIndex;
  readonly onGameModeChange: (gameMode: GameModeId) => void;
  readonly onMultiplayer: () => void;
}

type RoundStatus = "playing" | "won" | "lost";

function createLogo(): HTMLElement {
  return el("div", {
    className: "brand-lockup compact",
    children: [el("img", { className: "brand-logo", attrs: { src: "logo.svg", alt: "" } }), el("span", { className: "brand-name", text: "locato" })],
  });
}

function googleMapsEmbedApiKey(): string {
  const env = (import.meta as ImportMeta & { readonly env?: { readonly VITE_GOOGLE_MAPS_EMBED_API_KEY?: string } }).env;
  return env?.VITE_GOOGLE_MAPS_EMBED_API_KEY?.trim() ?? "";
}

function eligibleRounds(countryIndex: CountryIndex): readonly StreetViewCountryRound[] {
  return streetViewCountryRounds.filter((round) => round.frames.length === 3 && countryIndex.byCode.has(round.countryCode));
}

let lastStreetViewCountryCode: string | null = null;

function chooseRound(countryIndex: CountryIndex): StreetViewCountryRound {
  const rounds = eligibleRounds(countryIndex);
  if (rounds.length === 0) throw new Error("No Street View country rounds match the country index.");

  const availableRounds = rounds.length > 1 ? rounds.filter((item) => item.countryCode !== lastStreetViewCountryCode) : rounds;
  const selected = availableRounds[Math.floor(Math.random() * availableRounds.length)]!;
  lastStreetViewCountryCode = selected.countryCode;
  return selected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStreetViewFrame(value: unknown): value is StreetViewFrame {
  if (!isRecord(value)) return false;
  return isFiniteNumber(value.lat) && isFiniteNumber(value.lng) && isFiniteNumber(value.heading) && (value.pitch === undefined || isFiniteNumber(value.pitch)) && (value.fov === undefined || isFiniteNumber(value.fov)) && typeof value.label === "string";
}

function isStreetViewRound(value: unknown, countryIndex: CountryIndex): value is StreetViewCountryRound {
  if (!isRecord(value) || typeof value.countryCode !== "string" || !Array.isArray(value.frames)) return false;
  return countryIndex.byCode.has(value.countryCode) && value.frames.length === 3 && value.frames.every(isStreetViewFrame);
}

async function fetchStreetViewRound(countryIndex: CountryIndex, signal: AbortSignal): Promise<StreetViewCountryRound | null> {
  try {
    const response = await fetch("/api/streetview-country/round", { cache: "no-store", signal });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return isStreetViewRound(data, countryIndex) ? data : null;
  } catch {
    return null;
  }
}

function buildStreetViewEmbedUrl(apiKey: string, round: StreetViewCountryRound, attemptIndex: number): string {
  const frame = round.frames[attemptIndex] ?? round.frames[0]!;
  const params = new URLSearchParams({
    key: apiKey,
    location: `${frame.lat},${frame.lng}`,
    heading: String(frame.heading),
    pitch: String(frame.pitch ?? 0),
    fov: String(frame.fov ?? 90),
    radius: "1000",
    source: "outdoor",
  });
  return `https://www.google.com/maps/embed/v1/streetview?${params.toString()}`;
}

export function createStreetViewCountryScreen(options: StreetViewCountryScreenOptions): Screen {
  const controller = new AbortController();
  const apiKey = googleMapsEmbedApiKey();
  const maxAttempts = 3;
  const guessedCountryIds = new Set<CountryId>();
  let status: RoundStatus = "playing";
  let attemptIndex = 0;
  let round = chooseRound(options.countryIndex);
  let loadingRound = false;
  let roundRequestId = 0;

  function targetCountry(): Country {
    const country = options.countryIndex.byCode.get(round.countryCode);
    if (!country) throw new Error(`Unknown Street View country code: ${round.countryCode}`);
    return country;
  }

  const iframe = el("iframe", {
    className: "streetview-frame",
    attrs: {
      title: "Interactive Street View frame",
      loading: "lazy",
      referrerpolicy: "no-referrer-when-downgrade",
      allowfullscreen: "true",
    },
  });
  const missingKeyPanel = el("div", {
    className: "streetview-missing-key",
    children: [
      el("strong", { text: "Google Maps Embed API key missing" }),
      el("p", { text: "Add VITE_GOOGLE_MAPS_EMBED_API_KEY to your local .env file, then restart Vite." }),
    ],
  });
  const frameNumber = el("strong", { className: "stat-value", text: "1 / 3" });
  const guessesLeft = el("strong", { className: "stat-value", text: "3" });
  const previousGuesses = el("strong", { className: "stat-value", text: "None" });
  const roundResult = el("strong", { className: "streetview-result", text: "" });
  const input = el("input", {
    attrs: {
      id: "streetview-guess-input",
      name: "streetviewGuess",
      type: "text",
      autocomplete: "off",
      autocapitalize: "words",
      spellcheck: "false",
      placeholder: "Type a country...",
    },
  });
  const submitButton = el("button", { className: "primary-action", text: "Guess", attrs: { type: "submit" } });
  const nextRoundButton = el("button", { className: "primary-action", text: "Next round", attrs: { type: "button" } });
  const restartButton = el("button", { className: "ghost-action", text: "Restart country", attrs: { type: "button" } });
  const revealButton = el("button", { className: "ghost-action", text: "Reveal", attrs: { type: "button" } });
  const multiplayerButton = el("button", { className: "ghost-action", text: "Multiplayer", attrs: { type: "button" } });
  const feedback = createFeedbackView();

  const gameModeDropdown = createGameModeDropdown({
    selectedMode: "streetview-country",
    signal: controller.signal,
    onChange: (gameMode) => {
      if (isStreetViewGameModeId(gameMode)) return;
      if (isPromptGameModeId(gameMode) || isWorldMapGameModeId(gameMode)) options.onGameModeChange(gameMode);
    },
  });

  const form = el("form", {
    className: "guess-form streetview-guess-form",
    children: [el("label", { text: "Your country guess", attrs: { for: "streetview-guess-input" } }), el("div", { className: "input-row", children: [input, submitButton] })],
  });

  const statsPanel = el("div", {
    className: "stats-panel streetview-stats",
    children: [
      el("div", { className: "stat-card", children: [el("span", { className: "stat-label", text: "Frame" }), frameNumber] }),
      el("div", { className: "stat-card", children: [el("span", { className: "stat-label", text: "Guesses left" }), guessesLeft] }),
      el("div", { className: "stat-card previous-guesses-card", children: [el("span", { className: "stat-label", text: "Previous" }), previousGuesses] }),
    ],
  });

  const streetViewPanel = el("div", {
    className: "streetview-stage",
    children: [iframe, missingKeyPanel],
  });

  const element = el("section", {
    className: "game-screen streetview-country-screen",
    children: [
      el("header", {
        className: "game-header",
        children: [el("div", { className: "game-header-left", children: [createLogo(), gameModeDropdown.element] }), el("div", { className: "game-header-actions", children: [multiplayerButton] })],
      }),
      el("div", {
        className: "streetview-layout",
        children: [
          streetViewPanel,
          el("aside", {
            className: "answer-panel streetview-panel",
            children: [
              el("div", { className: "panel-title", children: [el("h2", { text: "Guess the country" })] }),
              el("p", { className: "streetview-rules", text: "You get 3 interactive Street View frames from the same hidden country. A wrong answer loads the next frame." }),
              form,
              statsPanel,
              feedback.element,
              roundResult,
              el("div", { className: "actions", children: [nextRoundButton, restartButton, revealButton] }),
            ],
          }),
        ],
      }),
    ],
  });

  function previousGuessText(): string {
    const names = [...guessedCountryIds].map((countryId) => options.countryIndex.byId[countryId]?.name).filter((name): name is string => Boolean(name));
    return names.length > 0 ? names.join(", ") : "None";
  }

  function render(): void {
    const attemptsUsed = attemptIndex + 1;
    frameNumber.textContent = `${attemptsUsed} / ${maxAttempts}`;
    guessesLeft.textContent = String(Math.max(0, maxAttempts - guessedCountryIds.size));
    previousGuesses.textContent = previousGuessText();
    submitButton.disabled = status !== "playing" || !apiKey || loadingRound;
    input.disabled = status !== "playing" || !apiKey || loadingRound;
    restartButton.disabled = loadingRound;
    revealButton.disabled = status !== "playing" || loadingRound;
    nextRoundButton.hidden = status === "playing";
    nextRoundButton.textContent = loadingRound ? "Loading..." : "Next round";
    roundResult.textContent = status === "won" ? `Correct — ${targetCountry().name}.` : status === "lost" ? `Answer — ${targetCountry().name}.` : "";
    missingKeyPanel.hidden = Boolean(apiKey);
    iframe.hidden = !apiKey;
    if (apiKey) {
      const nextSrc = buildStreetViewEmbedUrl(apiKey, round, attemptIndex);
      if (iframe.getAttribute("src") !== nextSrc) iframe.setAttribute("src", nextSrc);
    }
  }

  function resetCurrentCountry(message = "Fresh attempt. Guess the country from the first frame."): void {
    guessedCountryIds.clear();
    status = "playing";
    attemptIndex = 0;
    input.value = "";
    render();
    showFeedback(feedback, message, "neutral");
    input.focus();
  }

  async function loadRoundFromPool(message: string): Promise<void> {
    const requestId = ++roundRequestId;
    loadingRound = true;
    render();
    showFeedback(feedback, "Loading a Street View pool round...", "neutral");
    const serverRound = await fetchStreetViewRound(options.countryIndex, controller.signal);
    if (controller.signal.aborted || requestId !== roundRequestId) return;
    loadingRound = false;
    if (serverRound) {
      round = serverRound;
      resetCurrentCountry(message);
      return;
    }
    render();
    showFeedback(feedback, "Using the bundled fallback pool because the Street View pool API is unavailable.", "neutral");
  }

  function startNextRound(message = "Preparing the next country..."): void {
    round = chooseRound(options.countryIndex);
    resetCurrentCountry(message);
    void loadRoundFromPool("Loaded a fresh country from the Street View pool.");
  }

  function handleGuess(): void {
    if (status !== "playing" || loadingRound) return;
    const guess = submitCountryGuess(options.countryIndex, input.value, guessedCountryIds);
    if (!guess) {
      showFeedback(feedback, "I couldn't match that to a country. Try a full country name.", "neutral");
      input.select();
      return;
    }

    guessedCountryIds.add(guess.id);
    input.value = "";

    if (guess.code === round.countryCode) {
      const countryName = targetCountry().name;
      startNextRound(`Correct — ${countryName}. Loading the next country...`);
      return;
    }

    if (attemptIndex >= maxAttempts - 1) {
      status = "lost";
      render();
      showFeedback(feedback, `Not ${guess.name}. No guesses left.`, "bad");
      return;
    }

    attemptIndex += 1;
    render();
    showFeedback(feedback, `Not ${guess.name}. New frame loaded.`, "bad");
    input.focus();
  }

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      handleGuess();
    },
    { signal: controller.signal },
  );
  nextRoundButton.addEventListener("click", () => startNextRound(), { signal: controller.signal });
  restartButton.addEventListener("click", () => resetCurrentCountry(), { signal: controller.signal });
  revealButton.addEventListener(
    "click",
    () => {
      if (loadingRound) return;
      status = "lost";
      render();
      showFeedback(feedback, `Revealed: ${targetCountry().name}.`, "neutral");
    },
    { signal: controller.signal },
  );
  multiplayerButton.addEventListener("click", options.onMultiplayer, { signal: controller.signal });

  render();
  showFeedback(feedback, apiKey ? "Guess the country. You can move, pan, and zoom inside the Street View frame." : "Add your Google Maps Embed API key to enable Street View frames.", "neutral");
  void loadRoundFromPool("Loaded a fresh country from the Street View pool.");
  queueMicrotask(() => input.focus());

  return { element, destroy: () => controller.abort() };
}
