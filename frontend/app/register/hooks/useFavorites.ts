"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import * as api from "@/services/api";

const STORAGE_KEY = "halcyon_theme_favorites";

export function useFavorites(walletAddress: string | undefined) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const syncAttempted = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setFavorites(parsed);
        }
      }
    } catch (e) {
      console.error("Failed to load favorites from localStorage:", e);
    }
  }, []);

  // Sync with API when wallet connects
  useEffect(() => {
    if (!walletAddress || syncAttempted.current) return;

    const syncWithServer = async () => {
      setIsLoading(true);
      syncAttempted.current = true;

      try {
        // First, get server favorites
        const response = await api.getFavorites(walletAddress);

        if (response.success) {
          const serverThemes = response.favorites.themes || [];

          // Get local favorites
          let localThemes: string[] = [];
          try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
              const parsed = JSON.parse(stored);
              if (Array.isArray(parsed)) {
                localThemes = parsed;
              }
            }
          } catch {
            // Ignore parse errors
          }

          // Merge: unique items from both
          const merged = [...new Set([...serverThemes, ...localThemes])];
          setFavorites(merged);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

          // If we have local items not on server, sync them up
          if (localThemes.length > 0) {
            const toSync = localThemes.filter((t) => !serverThemes.includes(t));
            if (toSync.length > 0) {
              try {
                await api.syncFavorites(walletAddress, localThemes);
              } catch (e) {
                console.error("Failed to sync favorites to server:", e);
              }
            }
          }

          setIsSynced(true);
        }
      } catch (e) {
        console.error("Failed to sync favorites:", e);
      } finally {
        setIsLoading(false);
      }
    };

    syncWithServer();
  }, [walletAddress]);

  // Reset sync flag when wallet disconnects
  useEffect(() => {
    if (!walletAddress) {
      syncAttempted.current = false;
      setIsSynced(false);
    }
  }, [walletAddress]);

  const toggleFavorite = useCallback(
    async (themeId: string) => {
      const isCurrentlyFavorite = favorites.includes(themeId);
      const newFavorites = isCurrentlyFavorite
        ? favorites.filter((id) => id !== themeId)
        : [...favorites, themeId];

      // Optimistic update
      setFavorites(newFavorites);

      // Persist to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites));
      } catch (e) {
        console.error("Failed to save favorites to localStorage:", e);
      }

      // Sync to API if wallet is connected
      if (walletAddress) {
        try {
          if (isCurrentlyFavorite) {
            await api.removeFavorite(walletAddress, themeId);
          } else {
            await api.addFavorite(walletAddress, themeId);
          }
        } catch (e) {
          console.error("Failed to sync favorite to server:", e);
          // Don't revert - localStorage is the source of truth for UX
        }
      }
    },
    [favorites, walletAddress]
  );

  const isFavorite = useCallback(
    (themeId: string) => favorites.includes(themeId),
    [favorites]
  );

  const addFavorite = useCallback(
    (themeId: string) => {
      if (!favorites.includes(themeId)) {
        toggleFavorite(themeId);
      }
    },
    [favorites, toggleFavorite]
  );

  const removeFavorite = useCallback(
    (themeId: string) => {
      if (favorites.includes(themeId)) {
        toggleFavorite(themeId);
      }
    },
    [favorites, toggleFavorite]
  );

  const clearFavorites = useCallback(async () => {
    setFavorites([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error("Failed to clear favorites from localStorage:", e);
    }
  }, []);

  return {
    favorites,
    toggleFavorite,
    isFavorite,
    addFavorite,
    removeFavorite,
    clearFavorites,
    isLoading,
    isSynced,
    favoritesCount: favorites.length,
  };
}
