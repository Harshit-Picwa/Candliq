/**
 * Global location data using country-state-city library.
 * Supports searching countries, states, and cities worldwide.
 */
import { Country, State, City, ICity, ICountry, IState } from "country-state-city";

export interface LocationOption {
  city: string;
  state: string;
  stateCode: string;
  country: string;
  countryCode: string;
  /** Display label: "City, State, Country" */
  label: string;
}

// Common city name aliases (search term -> official names)
const CITY_ALIASES: Record<string, string[]> = {
  // India
  "bangalore": ["bengaluru"],
  "banglore": ["bengaluru"],
  "bengaluru": ["bangalore"],
  "bombay": ["mumbai"],
  "mumbai": ["bombay"],
  "calcutta": ["kolkata"],
  "kolkata": ["calcutta"],
  "madras": ["chennai"],
  "chennai": ["madras"],
  "poona": ["pune"],
  "pune": ["poona"],
  "baroda": ["vadodara"],
  "vadodara": ["baroda"],
  "trivandrum": ["thiruvananthapuram"],
  "thiruvananthapuram": ["trivandrum"],
  "cochin": ["kochi"],
  "kochi": ["cochin"],
  "benares": ["varanasi"],
  "varanasi": ["benares"],
  "mysore": ["mysuru"],
  "mysuru": ["mysore"],
  "mangalore": ["mangaluru"],
  "mangaluru": ["mangalore"],
  "shimla": ["simla"],
  "simla": ["shimla"],
  "pondicherry": ["puducherry"],
  "puducherry": ["pondicherry"],
  // International
  "peking": ["beijing"],
  "beijing": ["peking"],
  "canton": ["guangzhou"],
  "guangzhou": ["canton"],
  "bombai": ["mumbai"],
  "dilli": ["delhi"],
  "delhi": ["new delhi"],
  "new delhi": ["delhi"],
};

// Get all possible search terms for a query (including aliases)
function expandSearchTerms(query: string): string[] {
  const q = query.toLowerCase();
  const terms = [q];
  
  // Add aliases if any
  if (CITY_ALIASES[q]) {
    terms.push(...CITY_ALIASES[q]);
  }
  
  // Also check partial matches for aliases
  for (const [alias, targets] of Object.entries(CITY_ALIASES)) {
    if (alias.startsWith(q) || q.startsWith(alias)) {
      terms.push(...targets);
    }
  }
  
  return Array.from(new Set(terms)); // Remove duplicates
}

// Caches for performance
let allCitiesCache: ICity[] | null = null;
let countriesMap: Map<string, ICountry> | null = null;
let statesMap: Map<string, IState> | null = null;

function getAllCities(): ICity[] {
  if (!allCitiesCache) {
    allCitiesCache = City.getAllCities();
  }
  return allCitiesCache;
}

function getCountriesMap(): Map<string, ICountry> {
  if (!countriesMap) {
    countriesMap = new Map();
    Country.getAllCountries().forEach(c => countriesMap!.set(c.isoCode, c));
  }
  return countriesMap;
}

function getStatesMap(): Map<string, IState> {
  if (!statesMap) {
    statesMap = new Map();
    State.getAllStates().forEach(s => statesMap!.set(`${s.countryCode}-${s.isoCode}`, s));
  }
  return statesMap;
}

/**
 * Search locations by query string.
 * Returns matching cities with their state and country info.
 * Supports common city name aliases (e.g., Bangalore → Bengaluru)
 */
export function searchLocations(query: string, limit: number = 50): LocationOption[] {
  const q = (query || "").trim().toLowerCase();
  
  if (!q || q.length < 2) {
    // Return popular cities when no search query
    return getPopularCities().slice(0, limit);
  }

  const allCities = getAllCities();
  const countries = getCountriesMap();
  const states = getStatesMap();
  
  // Expand search terms to include aliases
  const searchTerms = expandSearchTerms(q);
  
  const exactMatches: LocationOption[] = [];
  const startsWithMatches: LocationOption[] = [];
  const containsMatches: LocationOption[] = [];
  const seenCities = new Set<string>(); // Avoid duplicates

  for (const city of allCities) {
    const cityLower = city.name.toLowerCase();
    const country = countries.get(city.countryCode);
    const state = states.get(`${city.countryCode}-${city.stateCode}`);
    
    if (!country) continue;
    
    const stateName = state?.name || "";
    const countryName = country.name;
    const cityKey = `${city.name}-${city.stateCode}-${city.countryCode}`;
    
    // Skip if we've already added this city
    if (seenCities.has(cityKey)) continue;
    
    // Check if city name matches any of the search terms
    let isExact = false;
    let startsWith = false;
    let contains = false;
    
    for (const term of searchTerms) {
      if (cityLower === term) isExact = true;
      else if (cityLower.startsWith(term)) startsWith = true;
      else if (cityLower.includes(term)) contains = true;
    }
    
    // Also check state and country names
    if (!isExact && !startsWith && !contains) {
      if (stateName.toLowerCase().includes(q) || countryName.toLowerCase().includes(q)) {
        contains = true;
      }
    }
    
    if (isExact || startsWith || contains) {
      seenCities.add(cityKey);
      
      const option: LocationOption = {
        city: city.name,
        state: stateName,
        stateCode: city.stateCode,
        country: countryName,
        countryCode: city.countryCode,
        label: stateName 
          ? `${city.name}, ${stateName}, ${countryName}`
          : `${city.name}, ${countryName}`,
      };
      
      if (isExact) {
        exactMatches.push(option);
      } else if (startsWith) {
        startsWithMatches.push(option);
      } else {
        containsMatches.push(option);
      }
      
      // Early exit if we have enough results
      if (exactMatches.length + startsWithMatches.length + containsMatches.length >= limit * 2) {
        break;
      }
    }
  }

  // Combine and sort results
  return [
    ...exactMatches.sort((a, b) => a.city.length - b.city.length),
    ...startsWithMatches.sort((a, b) => a.city.length - b.city.length),
    ...containsMatches.sort((a, b) => a.city.length - b.city.length),
  ].slice(0, limit);
}

/**
 * Get popular cities for initial display.
 */
let popularCitiesCache: LocationOption[] | null = null;

function getPopularCities(): LocationOption[] {
  if (popularCitiesCache) return popularCitiesCache;
  
  const popularLocations = [
    // India
    { city: "Mumbai", stateCode: "MH", countryCode: "IN" },
    { city: "Delhi", stateCode: "DL", countryCode: "IN" },
    { city: "Bangalore", stateCode: "KA", countryCode: "IN" },
    { city: "Bengaluru", stateCode: "KA", countryCode: "IN" },
    { city: "Hyderabad", stateCode: "TG", countryCode: "IN" },
    { city: "Chennai", stateCode: "TN", countryCode: "IN" },
    { city: "Kolkata", stateCode: "WB", countryCode: "IN" },
    { city: "Pune", stateCode: "MH", countryCode: "IN" },
    { city: "Ahmedabad", stateCode: "GJ", countryCode: "IN" },
    { city: "Jaipur", stateCode: "RJ", countryCode: "IN" },
    { city: "Lucknow", stateCode: "UP", countryCode: "IN" },
    { city: "Chandigarh", stateCode: "CH", countryCode: "IN" },
    // Australia
    { city: "Sydney", stateCode: "NSW", countryCode: "AU" },
    { city: "Melbourne", stateCode: "VIC", countryCode: "AU" },
    { city: "Brisbane", stateCode: "QLD", countryCode: "AU" },
    { city: "Perth", stateCode: "WA", countryCode: "AU" },
    { city: "Adelaide", stateCode: "SA", countryCode: "AU" },
    { city: "Gold Coast", stateCode: "QLD", countryCode: "AU" },
    { city: "Canberra", stateCode: "ACT", countryCode: "AU" },
    // New Zealand
    { city: "Auckland", stateCode: "AUK", countryCode: "NZ" },
    { city: "Wellington", stateCode: "WGN", countryCode: "NZ" },
    { city: "Christchurch", stateCode: "CAN", countryCode: "NZ" },
    // USA
    { city: "New York", stateCode: "NY", countryCode: "US" },
    { city: "Los Angeles", stateCode: "CA", countryCode: "US" },
    { city: "Chicago", stateCode: "IL", countryCode: "US" },
    { city: "San Francisco", stateCode: "CA", countryCode: "US" },
    { city: "Seattle", stateCode: "WA", countryCode: "US" },
    { city: "Boston", stateCode: "MA", countryCode: "US" },
    // UK
    { city: "London", stateCode: "ENG", countryCode: "GB" },
    { city: "Manchester", stateCode: "ENG", countryCode: "GB" },
    { city: "Birmingham", stateCode: "ENG", countryCode: "GB" },
    // Canada
    { city: "Toronto", stateCode: "ON", countryCode: "CA" },
    { city: "Vancouver", stateCode: "BC", countryCode: "CA" },
    { city: "Montreal", stateCode: "QC", countryCode: "CA" },
    // Singapore
    { city: "Singapore", stateCode: "01", countryCode: "SG" },
    // UAE
    { city: "Dubai", stateCode: "DU", countryCode: "AE" },
    { city: "Abu Dhabi", stateCode: "AZ", countryCode: "AE" },
  ];

  const countries = getCountriesMap();
  const states = getStatesMap();
  const allCities = getAllCities();
  const results: LocationOption[] = [];
  
  for (const loc of popularLocations) {
    const country = countries.get(loc.countryCode);
    const state = states.get(`${loc.countryCode}-${loc.stateCode}`);
    
    if (country) {
      // Find matching city from all cities
      const matchingCity = allCities.find(
        c => c.countryCode === loc.countryCode && 
             c.stateCode === loc.stateCode && 
             c.name.toLowerCase() === loc.city.toLowerCase()
      );
      
      if (matchingCity) {
        results.push({
          city: matchingCity.name,
          state: state?.name || "",
          stateCode: loc.stateCode,
          country: country.name,
          countryCode: country.isoCode,
          label: state?.name 
            ? `${matchingCity.name}, ${state.name}, ${country.name}`
            : `${matchingCity.name}, ${country.name}`,
        });
      }
    }
  }
  
  popularCitiesCache = results;
  return results;
}

/** Get display label for saved values. */
export function getLocationLabel(
  city: string | null | undefined,
  state: string | null | undefined,
  country: string | null | undefined
): string {
  const parts = [city, state, country].filter(Boolean).map((x) => (x || "").trim());
  return parts.length ? parts.join(", ") : "";
}

// Export for backward compatibility
export const LOCATIONS_AU_NZ: LocationOption[] = [];
export function findLocationOption(
  city: string | null | undefined,
  state: string | null | undefined,
  country: string | null | undefined
): LocationOption | null {
  if (!city) return null;
  const results = searchLocations(city, 10);
  return results.find(
    opt => opt.city.toLowerCase() === (city || "").toLowerCase() &&
           opt.country.toLowerCase() === (country || "").toLowerCase()
  ) || null;
}
