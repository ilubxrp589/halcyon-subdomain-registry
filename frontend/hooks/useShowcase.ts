"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getShowcaseImages, ShowcaseImage } from "@/services/api";

interface UseShowcaseReturn {
  images: ShowcaseImage[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  onCycleComplete: () => void;
}

const DEFAULT_BATCH_SIZE = 24;

/**
 * Hook to fetch showcase images for the register page marquee gallery.
 * Supports batch rotation: call onCycleComplete() when the marquee animation
 * finishes a full loop to swap in a fresh batch of images.
 * @param batchSize Number of images to fetch per batch (default 24)
 */
export function useShowcase(batchSize = DEFAULT_BATCH_SIZE): UseShowcaseReturn {
  const [images, setImages] = useState<ShowcaseImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seedRef = useRef(Math.floor(Math.random() * 1000000));
  const isFetchingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const fetchImages = useCallback(async (retries = 2) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    // Only show loading state on first fetch, not background batch swaps
    if (!hasLoadedRef.current) setIsLoading(true);
    setError(null);

    try {
      const result = await getShowcaseImages(batchSize, seedRef.current);
      if (result.success && result.images.length > 0) {
        setImages(result.images);
      } else if (retries > 0) {
        isFetchingRef.current = false;
        await new Promise((r) => setTimeout(r, 500));
        return fetchImages(retries - 1);
      } else {
        setError(result.error || "Failed to load showcase images");
        setImages(result.images || []);
      }
    } catch (err) {
      if (retries > 0) {
        isFetchingRef.current = false;
        await new Promise((r) => setTimeout(r, 500));
        return fetchImages(retries - 1);
      }
      setError(err instanceof Error ? err.message : "Failed to load showcase images");
      setImages([]);
    } finally {
      hasLoadedRef.current = true;
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [batchSize]);

  // Called when the marquee animation completes a full cycle
  const onCycleComplete = useCallback(() => {
    // Increment seed to get a different batch
    seedRef.current += 1;
    fetchImages();
  }, [fetchImages]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  return {
    images,
    isLoading,
    error,
    refetch: fetchImages,
    onCycleComplete,
  };
}

export default useShowcase;
