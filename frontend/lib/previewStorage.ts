/**
 * IndexedDB storage for NFT preview images
 * Handles large base64 images that exceed sessionStorage quota
 */

const DB_NAME = 'hsr_previews';
const DB_VERSION = 1;
const STORE_NAME = 'preview_state';
const STATE_KEY = 'current_session';

export interface SavedPreview {
  imageBase64: string;
  seed: number;
  theme: string;
  customPrompt?: string;
}

export interface FluxImageState {
  index: number;
  imageBase64: string;
  theme: {
    id: string;
    name: string;
    category: string;
  };
  seed: number;
  success: boolean;
  generationId?: string;  // Track which generation this image belongs to
}

export interface PreviewState {
  savedPreviews: SavedPreview[];
  selectedPreviewIndex: number | null;
  searchResult: {
    available: boolean;
    subdomain: string;
    tld: string;
    fqdn: string;
    tier?: string;
    priceUSD?: number;
    priceFLR?: number;
  } | null;
  selectedTheme: string;
  customPrompt: string;
  step: string;
  // Flux Multi-GPU state
  fluxImages?: FluxImageState[];
  selectedFluxIndex?: number | null;
  selectedFluxThemes?: string[];
  fluxGenerationId?: string | null; // Required for purchase - links to backend generation
  walletAddress?: string; // Track which wallet this belongs to
  timestamp?: number; // When this was saved
  // Wizard state for full restoration
  wizardModel?: "playground" | "animagine" | null;
  wizardArtStyleId?: string | null;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Save preview state to IndexedDB
 */
export async function savePreviewState(state: PreviewState): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(state, STATE_KEY);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('Failed to save preview state to IndexedDB:', error);
  }
}

/**
 * Load preview state from IndexedDB
 */
export async function loadPreviewState(): Promise<PreviewState | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(STATE_KEY);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('Failed to load preview state from IndexedDB:', error);
    return null;
  }
}

/**
 * Clear preview state from IndexedDB
 */
export async function clearPreviewState(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(STATE_KEY);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('Failed to clear preview state from IndexedDB:', error);
  }
}
