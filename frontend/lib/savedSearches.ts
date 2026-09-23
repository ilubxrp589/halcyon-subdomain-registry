const STORAGE_KEY = "hsr_saved_searches";
const MAX_SAVED = 20;

export interface SavedSearch {
  id: string;
  query: string;
  tld: string;
  filters?: {
    minLen?: number;
    maxLen?: number;
    minPrice?: number;
    maxPrice?: number;
  };
  savedAt: number;
}

export function loadSavedSearches(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedSearch[];
  } catch {
    return [];
  }
}

export function saveSearch(search: Omit<SavedSearch, "id" | "savedAt">): SavedSearch[] {
  const searches = loadSavedSearches();

  // Prevent duplicates by query+tld
  const existing = searches.findIndex(
    (s) => s.query === search.query && s.tld === search.tld
  );
  if (existing !== -1) {
    searches.splice(existing, 1);
  }

  const entry: SavedSearch = {
    ...search,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    savedAt: Date.now(),
  };

  searches.unshift(entry);

  // Trim to max
  const trimmed = searches.slice(0, MAX_SAVED);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function deleteSavedSearch(id: string): SavedSearch[] {
  const searches = loadSavedSearches().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
  return searches;
}
