/**
 * Mini location list for Australia & New Zealand (LinkedIn-style single dropdown).
 * Format: City, State/Region, Country — searchable as one string.
 */
export interface LocationOption {
  city: string;
  state: string;
  country: string;
  /** Display label: "City, State, Country" */
  label: string;
}

function loc(city: string, state: string, country: string): LocationOption {
  return {
    city,
    state,
    country,
    label: state ? `${city}, ${state}, ${country}` : `${city}, ${country}`,
  };
}

/** Australia: major cities by state/territory */
const AU_LOCATIONS: LocationOption[] = [
  // New South Wales
  loc("Sydney", "NSW", "Australia"),
  loc("Newcastle", "NSW", "Australia"),
  loc("Wollongong", "NSW", "Australia"),
  loc("Central Coast", "NSW", "Australia"),
  // Victoria
  loc("Melbourne", "VIC", "Australia"),
  loc("Geelong", "VIC", "Australia"),
  loc("Ballarat", "VIC", "Australia"),
  // Queensland
  loc("Brisbane", "QLD", "Australia"),
  loc("Gold Coast", "QLD", "Australia"),
  loc("Sunshine Coast", "QLD", "Australia"),
  loc("Cairns", "QLD", "Australia"),
  loc("Townsville", "QLD", "Australia"),
  // Western Australia
  loc("Perth", "WA", "Australia"),
  loc("Fremantle", "WA", "Australia"),
  // South Australia
  loc("Adelaide", "SA", "Australia"),
  // Tasmania
  loc("Hobart", "TAS", "Australia"),
  loc("Launceston", "TAS", "Australia"),
  // Australian Capital Territory
  loc("Canberra", "ACT", "Australia"),
  // Northern Territory
  loc("Darwin", "NT", "Australia"),
  loc("Alice Springs", "NT", "Australia"),
];

/** New Zealand: major cities by region */
const NZ_LOCATIONS: LocationOption[] = [
  loc("Auckland", "Auckland", "New Zealand"),
  loc("Wellington", "Wellington", "New Zealand"),
  loc("Christchurch", "Canterbury", "New Zealand"),
  loc("Hamilton", "Waikato", "New Zealand"),
  loc("Tauranga", "Bay of Plenty", "New Zealand"),
  loc("Napier", "Hawke's Bay", "New Zealand"),
  loc("Dunedin", "Otago", "New Zealand"),
  loc("Palmerston North", "Manawatu-Wanganui", "New Zealand"),
  loc("Nelson", "Nelson", "New Zealand"),
  loc("Rotorua", "Bay of Plenty", "New Zealand"),
  loc("New Plymouth", "Taranaki", "New Zealand"),
  loc("Whangārei", "Northland", "New Zealand"),
  loc("Invercargill", "Southland", "New Zealand"),
  loc("Whanganui", "Manawatu-Wanganui", "New Zealand"),
  loc("Gisborne", "Gisborne", "New Zealand"),
];

export const LOCATIONS_AU_NZ: LocationOption[] = [...AU_LOCATIONS, ...NZ_LOCATIONS];

/** Find a single option matching city, state, country (e.g. from saved project). */
export function findLocationOption(
  city: string | null | undefined,
  state: string | null | undefined,
  country: string | null | undefined
): LocationOption | null {
  if (!city && !state && !country) return null;
  const c = (city || "").trim();
  const s = (state || "").trim();
  const co = (country || "").trim();
  return (
    LOCATIONS_AU_NZ.find(
      (opt) =>
        opt.city === c && opt.state === s && opt.country === co
    ) ?? null
  );
}

/** Get display label for saved values (may not be in list). */
export function getLocationLabel(
  city: string | null | undefined,
  state: string | null | undefined,
  country: string | null | undefined
): string {
  const opt = findLocationOption(city, state, country);
  if (opt) return opt.label;
  const parts = [city, state, country].filter(Boolean).map((x) => (x || "").trim());
  return parts.length ? parts.join(", ") : "";
}
