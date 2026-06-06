import { isToleratedMisspelling, normalizeAnswerVariants, type Country } from "../countries";
import type { GameMode } from "../modes";

export function isAcceptedCountryGuess(country: Country, guess: string, mode: GameMode, auto = false): boolean {
  const guesses = normalizeAnswerVariants(guess);
  if (guesses.length === 0) return false;
  if (auto) return guesses.includes(country.normalizedName);

  const exactAnswers = new Set<string>();
  for (const value of [country.name, ...(mode.acceptAliases ? country.aliases : [])]) {
    for (const variant of normalizeAnswerVariants(value)) exactAnswers.add(variant);
  }

  if (mode.acceptCountryCodes) {
    for (const variant of normalizeAnswerVariants(country.code)) exactAnswers.add(variant);
  }

  if (guesses.some((candidate) => exactAnswers.has(candidate))) return true;

  const fuzzyAnswers = [country.name, ...(mode.acceptAliases ? country.aliases : [])];
  return fuzzyAnswers.some((answer) => isToleratedMisspelling(guess, answer));
}
