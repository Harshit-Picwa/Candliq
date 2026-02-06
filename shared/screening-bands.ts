/**
 * Screening time bands: total questions, included (mandatory), and excluded per range.
 * Used by generation logic and UI to show which band applies for the current screening time.
 */

export interface ScreeningBand {
  minMinutes: number;
  maxMinutes: number;
  label: string;
  questionCount: number;
  includedCount: number;
  excludedCount: number;
}

/** Bands: screening time (minutes) → total, included, excluded (user-defined pattern). */
export const SCREENING_QUESTION_COUNT_BANDS: ScreeningBand[] = [
  { minMinutes: 1, maxMinutes: 19, label: "< 20", questionCount: 5, includedCount: 3, excludedCount: 2 },
  { minMinutes: 20, maxMinutes: 24, label: "20–25", questionCount: 7, includedCount: 5, excludedCount: 2 },
  { minMinutes: 25, maxMinutes: 29, label: "25–30", questionCount: 8, includedCount: 6, excludedCount: 2 },
  { minMinutes: 30, maxMinutes: 34, label: "30–35", questionCount: 11, includedCount: 7, excludedCount: 4 },
  { minMinutes: 35, maxMinutes: 39, label: "35–40", questionCount: 13, includedCount: 8, excludedCount: 5 },
  { minMinutes: 40, maxMinutes: 44, label: "40–45", questionCount: 13, includedCount: 9, excludedCount: 4 },
  { minMinutes: 45, maxMinutes: 49, label: "45–50", questionCount: 14, includedCount: 10, excludedCount: 4 },
  { minMinutes: 50, maxMinutes: 54, label: "50–55", questionCount: 15, includedCount: 11, excludedCount: 4 },
  { minMinutes: 55, maxMinutes: 60, label: "55–60", questionCount: 16, includedCount: 12, excludedCount: 4 },
];

/**
 * Returns the band for the given screening time (or first/last band if outside range).
 * Special case: exactly 20 minutes → 4 included + 2 buffer = 6 total questions.
 */
export function getBandForScreening(screeningMinutes: number): ScreeningBand {
  if (!Number.isFinite(screeningMinutes) || screeningMinutes < 1) {
    return SCREENING_QUESTION_COUNT_BANDS[0];
  }
  if (screeningMinutes > 60) {
    return SCREENING_QUESTION_COUNT_BANDS[SCREENING_QUESTION_COUNT_BANDS.length - 1];
  }
  // Special case: screening time exactly 20 → 4 included + 2 buffer = 6 total
  if (screeningMinutes === 20) {
    return {
      minMinutes: 20,
      maxMinutes: 20,
      label: "20",
      questionCount: 6,
      includedCount: 4,
      excludedCount: 2,
    };
  }
  const band = SCREENING_QUESTION_COUNT_BANDS.find(
    (b) => screeningMinutes >= b.minMinutes && screeningMinutes <= b.maxMinutes
  );
  return band ?? SCREENING_QUESTION_COUNT_BANDS[0];
}

/**
 * Returns the target total question count (including excluded) for the given screening time.
 */
export function getTargetQuestionCountForScreening(screeningMinutes: number): number {
  return getBandForScreening(screeningMinutes).questionCount;
}

/**
 * Returns the excluded question count for the given screening time.
 */
export function getExcludedCountForScreening(screeningMinutes: number): number {
  return getBandForScreening(screeningMinutes).excludedCount;
}

export interface ScreeningBandWithIncluded extends ScreeningBand {
  included: boolean;
}

/**
 * Returns all bands with an `included` flag: true for the band that contains screeningMinutes, false otherwise.
 * Use in UI to show "Included" / "Not included" per row.
 */
export function getScreeningBandsWithIncluded(screeningMinutes: number): ScreeningBandWithIncluded[] {
  const num = Number.isFinite(screeningMinutes) && screeningMinutes >= 1 ? screeningMinutes : null;
  return SCREENING_QUESTION_COUNT_BANDS.map((band) => ({
    ...band,
    included: num !== null && num >= band.minMinutes && num <= band.maxMinutes,
  }));
}
