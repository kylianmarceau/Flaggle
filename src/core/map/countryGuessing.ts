import { normalizeAnswerVariants, type Country, type CountryIndex, type CountryId } from "../countries";

const MIN_AUTO_MATCH_LENGTH = 3;

export function detectCountryGuess(index: CountryIndex, value: string, guessedCountryIds: ReadonlySet<CountryId>): Country | null {
  const guesses = normalizeAnswerVariants(value).filter((guess) => guess.length >= MIN_AUTO_MATCH_LENGTH);

  for (const guess of guesses) {
    const countryIds = index.byAnswer.get(guess);
    if (!countryIds || countryIds.length !== 1) continue;

    const [countryId] = countryIds;
    if (countryId === undefined || guessedCountryIds.has(countryId)) continue;

    return index.byId[countryId] ?? null;
  }

  return null;
}
