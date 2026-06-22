"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import {
  GENRES,
  RoundResult,
  SNIPPET_STEPS,
  TRACKS,
  Track,
  TrackGenre,
  normalizeGuess,
  tracksForGenre,
} from "@/app/lib/catalog";

const ROUND_COUNT = 5;

type Feedback = {
  tone: "neutral" | "good" | "bad";
  message: string;
};

function shuffleTracks(tracks: Track[]) {
  return [...tracks].sort(() => Math.random() - 0.5).slice(0, ROUND_COUNT);
}

function formatPoints(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function MusicGame() {
  const [selectedGenre, setSelectedGenre] = useState<TrackGenre | null>(null);
  const [roundTracks, setRoundTracks] = useState<Track[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [snippetIndex, setSnippetIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [guess, setGuess] = useState("");
  const [results, setResults] = useState<RoundResult[]>([]);
  const [genreTracks, setGenreTracks] = useState<Record<string, Track[]>>({});
  const [catalogSource, setCatalogSource] = useState<"demo" | "spotify">("demo");
  const [isLoadingGenre, setIsLoadingGenre] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({
    tone: "neutral",
    message: "Pick a genre to start.",
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const currentTrack = roundTracks[roundIndex];
  const currentStep = SNIPPET_STEPS[snippetIndex];
  const isComplete = selectedGenre !== null && results.length === ROUND_COUNT;
  const answerOptions = useMemo(
    () =>
      selectedGenre
        ? (genreTracks[selectedGenre] ?? tracksForGenre(selectedGenre)).map(
            (track) => track.title,
          )
        : TRACKS.map((track) => track.title),
    [genreTracks, selectedGenre],
  );
  const progress = selectedGenre
    ? Math.min(((roundIndex + 1) / ROUND_COUNT) * 100, 100)
    : 0;

  function stopAudio() {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    setIsPlaying(false);
  }

  async function loadGenreTracks(genre: TrackGenre) {
    const response = await fetch(`/api/spotify/tracks?genre=${encodeURIComponent(genre)}`);
    const payload = (await response.json()) as {
      source?: "demo" | "spotify";
      warning?: string;
      tracks?: Track[];
      error?: string;
    };

    if (!response.ok || !payload.tracks?.length) {
      throw new Error(payload.error ?? "Could not load Spotify tracks.");
    }

    setGenreTracks((current) => ({
      ...current,
      [genre]: payload.tracks ?? tracksForGenre(genre),
    }));
    setCatalogSource(payload.source ?? "spotify");

    return {
      tracks: payload.tracks,
      source: payload.source ?? "spotify",
      warning: payload.warning,
    };
  }

  async function startGame(genre: TrackGenre) {
    stopAudio();
    setIsLoadingGenre(true);
    setFeedback({
      tone: "neutral",
      message: `Loading ${genre} tracks from Spotify.`,
    });

    let tracks = genreTracks[genre];
    let source: "demo" | "spotify" = catalogSource;
    let warning: string | undefined;

    try {
      if (!tracks?.length || source !== "spotify") {
        const loaded = await loadGenreTracks(genre);
        tracks = loaded.tracks;
        source = loaded.source;
        warning = loaded.warning;
      }
    } catch (error) {
      tracks = tracksForGenre(genre);
      source = "demo";
      warning =
        error instanceof Error
          ? error.message
          : "Spotify was unavailable, so demo tracks were loaded.";
      setCatalogSource("demo");
    }

    setSelectedGenre(genre);
    setRoundTracks(shuffleTracks(tracks));
    setRoundIndex(0);
    setSnippetIndex(0);
    setScore(0);
    setStreak(0);
    setGuess("");
    setResults([]);
    setIsLoadingGenre(false);
    setFeedback({
      tone: source === "spotify" ? "good" : "bad",
      message:
        source === "spotify"
          ? `${genre} run loaded with real songs.`
          : warning ?? `${genre} run loaded with demo tracks.`,
    });
  }

  async function playSnippet() {
    if (!audioRef.current || !currentTrack) {
      return;
    }

    stopAudio();
    audioRef.current.src = currentTrack.audioUrl;
    audioRef.current.currentTime = 0;
    setIsPlaying(true);

    try {
      await audioRef.current.play();
      stopTimerRef.current = window.setTimeout(() => {
        stopAudio();
      }, currentStep.seconds * 1000);
    } catch {
      setIsPlaying(false);
      setFeedback({
        tone: "bad",
        message: "Audio playback needs a click first.",
      });
    }
  }

  function completeRound(guessed: boolean, earnedPoints: number) {
    if (!currentTrack) {
      return;
    }

    stopAudio();
    const nextResults = [
      ...results,
      {
        track: currentTrack,
        guessed,
        attempts: snippetIndex + 1,
        points: earnedPoints,
      },
    ];

    setResults(nextResults);
    setScore((currentScore) => currentScore + earnedPoints);
    setGuess("");

    if (nextResults.length === ROUND_COUNT) {
      setFeedback({
        tone: guessed ? "good" : "bad",
        message: "Run complete.",
      });
      return;
    }

    setRoundIndex((index) => index + 1);
    setSnippetIndex(0);
  }

  function submitGuess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentTrack || isComplete) {
      return;
    }

    const isCorrect =
      normalizeGuess(guess) === normalizeGuess(currentTrack.title) ||
      normalizeGuess(guess) ===
        normalizeGuess(`${currentTrack.title} ${currentTrack.artist}`);

    if (isCorrect) {
      const earnedPoints = currentStep.points + streak * 50;
      setStreak((value) => value + 1);
      setFeedback({
        tone: "good",
        message: `Correct: ${currentTrack.title} by ${currentTrack.artist}.`,
      });
      completeRound(true, earnedPoints);
      return;
    }

    if (snippetIndex < SNIPPET_STEPS.length - 1) {
      const nextStep = SNIPPET_STEPS[snippetIndex + 1];
      setSnippetIndex((index) => index + 1);
      setStreak(0);
      setFeedback({
        tone: "bad",
        message: `Not quite. Unlocking ${nextStep.label}.`,
      });
      return;
    }

    setStreak(0);
    setFeedback({
      tone: "bad",
      message: `Out of reveals: ${currentTrack.title} by ${currentTrack.artist}.`,
    });
    completeRound(false, 0);
  }

  function skipRound() {
    if (!currentTrack || isComplete) {
      return;
    }

    setStreak(0);
    setFeedback({
      tone: "bad",
      message: `Skipped: ${currentTrack.title} by ${currentTrack.artist}.`,
    });
    completeRound(false, 0);
  }

  function resetGame() {
    stopAudio();
    setSelectedGenre(null);
    setRoundTracks([]);
    setRoundIndex(0);
    setSnippetIndex(0);
    setScore(0);
    setStreak(0);
    setGuess("");
    setResults([]);
    setFeedback({
      tone: "neutral",
      message: "Pick a genre to start.",
    });
  }

  return (
    <main className="min-h-screen px-4 py-5 text-stone-950 sm:px-6 lg:px-8">
      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} preload="auto" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-[8px] border border-stone-950/10 bg-white/72 p-4 shadow-[0_18px_70px_rgba(48,35,19,0.10)] backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
              Needle Drop
            </p>
            <h1 className="mt-1 text-3xl font-black leading-none sm:text-5xl">
              Guess the song before the snippet gives it away.
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <ScorePill label="Score" value={formatPoints(score)} />
            <ScorePill label="Round" value={selectedGenre ? `${Math.min(roundIndex + 1, ROUND_COUNT)}/5` : "0/5"} />
            <ScorePill label="Streak" value={String(streak)} />
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.84fr_1.16fr]">
          <GenrePanel
            selectedGenre={selectedGenre}
            onStart={startGame}
            disabled={isPlaying || isLoadingGenre}
          />

          <section className="rounded-[8px] border border-stone-950/10 bg-[#14110f] p-4 text-white shadow-[0_18px_70px_rgba(20,17,15,0.18)] sm:p-6">
            {selectedGenre && currentTrack ? (
              <div className="flex min-h-[520px] flex-col justify-between gap-6">
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between gap-3 text-sm font-bold text-white/68">
                      <span>{selectedGenre}</span>
                      <span>
                        {catalogSource === "spotify"
                          ? "Spotify songs"
                          : "Demo"}{" "}
                        ·{" "}
                        {Math.round(progress)}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/12">
                      <div
                        className="h-full rounded-full bg-amber-300 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div
                    className="overflow-hidden rounded-[8px] border border-white/10 p-5"
                    style={{
                      background: currentTrack.artworkUrl
                        ? `linear-gradient(135deg, ${currentTrack.color} 0%, rgba(20,17,15,0.86) 55%, #14110f 100%), url(${currentTrack.artworkUrl}) center / cover`
                        : `linear-gradient(135deg, ${currentTrack.color} 0%, #14110f 72%)`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/72">
                          Track {roundIndex + 1}
                        </p>
                        <p className="mt-7 max-w-[11ch] text-6xl font-black leading-[0.88] text-white sm:text-7xl">
                          ???
                        </p>
                      </div>
                      <div className="rounded-full bg-black/24 px-3 py-1 text-sm font-bold">
                        {currentStep.label}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-6 gap-2">
                    {SNIPPET_STEPS.map((step, index) => (
                      <div
                        key={step.label}
                        className={`h-16 rounded-[8px] border p-2 text-center ${
                          index <= snippetIndex
                            ? "border-amber-300 bg-amber-300 text-stone-950"
                            : "border-white/10 bg-white/8 text-white/48"
                        }`}
                      >
                        <div className="text-sm font-black">{step.label}</div>
                        <div className="mt-1 text-xs font-bold">
                          {step.points}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    className="flex h-16 w-full items-center justify-center rounded-[8px] bg-white text-lg font-black text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-55"
                    type="button"
                    onClick={playSnippet}
                    disabled={isPlaying || isComplete}
                    aria-label="Play current snippet"
                  >
                    {isPlaying ? "Playing" : `Play ${currentStep.label}`}
                  </button>

                  <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={submitGuess}>
                    <div>
                      <input
                        className="h-14 w-full rounded-[8px] border border-white/14 bg-white/10 px-4 font-bold text-white outline-none placeholder:text-white/42 focus:border-amber-300"
                        value={guess}
                        onChange={(event) => setGuess(event.target.value)}
                        placeholder="Song title"
                        list="song-options"
                      disabled={isComplete}
                      />
                      <datalist id="song-options">
                        {answerOptions.map((title) => (
                          <option key={title} value={title} />
                        ))}
                      </datalist>
                    </div>
                    <button
                      className="h-14 rounded-[8px] bg-emerald-400 px-6 font-black text-stone-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-55"
                      type="submit"
                    disabled={!guess.trim() || isComplete}
                    >
                      Guess
                    </button>
                  </form>

                  <div
                    className={`rounded-[8px] border px-4 py-3 text-sm font-bold ${
                      feedback.tone === "good"
                        ? "border-emerald-300/40 bg-emerald-300/14 text-emerald-100"
                        : feedback.tone === "bad"
                          ? "border-rose-300/40 bg-rose-300/14 text-rose-100"
                          : "border-white/12 bg-white/8 text-white/72"
                    }`}
                  >
                    {feedback.message}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    className="h-12 rounded-[8px] border border-white/16 px-5 font-black text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    onClick={skipRound}
                    disabled={isComplete || isLoadingGenre}
                  >
                    Skip
                  </button>
                  <button
                    className="h-12 rounded-[8px] border border-white/16 px-5 font-black text-white transition hover:bg-white/10"
                    type="button"
                    onClick={resetGame}
                    disabled={isLoadingGenre}
                  >
                    New genre
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center rounded-[8px] border border-white/10 bg-white/8 p-8 text-center">
                <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-200">
                    {isLoadingGenre ? "Loading" : "Ready"}
                  </p>
                  <p className="mt-4 text-4xl font-black leading-tight">
                    {isLoadingGenre ? "Finding previews." : "Choose a genre."}
                  </p>
                </div>
              </div>
            )}
          </section>
        </section>

        {isComplete ? (
          <section className="rounded-[8px] border border-stone-950/10 bg-white/80 p-5 shadow-[0_18px_70px_rgba(48,35,19,0.10)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">
                  Final score
                </p>
                <h2 className="text-5xl font-black">{formatPoints(score)}</h2>
              </div>
              <button
                className="h-12 rounded-[8px] bg-stone-950 px-5 font-black text-white transition hover:bg-stone-800"
                type="button"
                onClick={() => selectedGenre && void startGame(selectedGenre)}
              >
                Replay genre
              </button>
            </div>
            <div className="mt-5 grid gap-2 md:grid-cols-5">
              {results.map((result, index) => (
                <article
                  className="rounded-[8px] border border-stone-950/10 bg-white p-3"
                  key={result.track.id}
                >
                  <p className="text-xs font-black text-stone-500">
                    Round {index + 1}
                  </p>
                  <h3 className="mt-2 font-black leading-tight">
                    {result.track.title}
                  </h3>
                  <p className="text-sm font-bold text-stone-500">
                    {result.track.artist}
                  </p>
                  <p className="mt-3 text-sm font-black">
                    {result.guessed ? `${result.points} pts` : "Missed"}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function ScorePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-20 rounded-[8px] border border-stone-950/10 bg-white px-3 py-2">
      <div className="text-[11px] font-black uppercase tracking-[0.12em] text-stone-500">
        {label}
      </div>
      <div className="text-lg font-black text-stone-950">{value}</div>
    </div>
  );
}

function GenrePanel({
  selectedGenre,
  onStart,
  disabled,
}: {
  selectedGenre: TrackGenre | null;
  onStart: (genre: TrackGenre) => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-[8px] border border-stone-950/10 bg-white/78 p-4 shadow-[0_18px_70px_rgba(48,35,19,0.10)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-stone-500">
            Genres
          </p>
          <h2 className="text-2xl font-black">Pick a lane</h2>
        </div>
        <div className="rounded-full bg-stone-950 px-3 py-1 text-sm font-black text-white">
          5 rounds
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {GENRES.map((genre) => {
          const isSelected = selectedGenre === genre;
          return (
            <button
              className={`group flex min-h-24 items-center justify-between gap-4 rounded-[8px] border p-4 text-left transition ${
                isSelected
                  ? "border-stone-950 bg-stone-950 text-white"
                  : "border-stone-950/10 bg-white hover:border-stone-950/28 hover:bg-[#fffaf1]"
              }`}
              key={genre}
              type="button"
              onClick={() => void onStart(genre)}
              disabled={disabled}
            >
              <span>
                <span className="block text-xl font-black">{genre}</span>
                <span
                  className={`mt-1 block text-sm font-bold ${
                    isSelected ? "text-white/60" : "text-stone-500"
                  }`}
                >
                  Spotify-powered run
                </span>
              </span>
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full font-black ${
                  isSelected
                    ? "bg-amber-300 text-stone-950"
                    : "bg-stone-100 text-stone-950 group-hover:bg-amber-200"
                }`}
                aria-hidden="true"
              >
                {isSelected ? "On" : "Go"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
