"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ShowcaseImage } from "@/services/api";

interface FadeSlotProps {
  images: ShowcaseImage[];
  initialDelay: number;
  interval: number;
  size: number;
}

function FadeSlot({ images, initialDelay, interval, size }: FadeSlotProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [opacity, setOpacity] = useState(0);
  const [imgSrc, setImgSrc] = useState(images[0]?.url || "");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const cycle = useCallback(() => {
    setOpacity(0);
    // Wait for full fade-out before swapping image
    timeoutRef.current = setTimeout(() => {
      setCurrentIdx((prev) => {
        const next = (prev + 1) % images.length;
        setImgSrc(images[next]?.url || "");
        return next;
      });
      requestAnimationFrame(() => {
        setOpacity(1);
      });
    }, 2000);
  }, [images]);

  useEffect(() => {
    const startTimeout = setTimeout(() => {
      setOpacity(1);
      intervalRef.current = setInterval(cycle, interval);
    }, initialDelay);

    return () => {
      clearTimeout(startTimeout);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [initialDelay, interval, cycle]);

  // Update imgSrc if the images array changes (new batch)
  useEffect(() => {
    if (images[currentIdx]) {
      setImgSrc(images[currentIdx].url);
    }
  }, [images, currentIdx]);

  if (!images.length) return null;

  return (
    <div
      className="fade-slot"
      style={{ width: size, height: size }}
    >
      <div className="fade-slot-border">
        <div className="fade-slot-inner">
          <img
            src={imgSrc}
            alt="Showcase art"
            width={size}
            height={size}
            className="w-full h-full object-cover"
            style={{
              opacity,
              transition: "opacity 2s ease-in-out",
            }}
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}

interface FadeGalleryGridProps {
  images: ShowcaseImage[];
  /** Number of rows */
  rows?: number;
  /** Card size in px */
  cardSize?: number;
  /** Gap between cards in px */
  gap?: number;
  /** Min interval between fades per slot (ms) */
  minInterval?: number;
  /** Max interval between fades per slot (ms) */
  maxInterval?: number;
}

export function FadeGallery({
  images,
  rows = 1,
  cardSize = 200,
  gap = 8,
  minInterval = 8000,
  maxInterval = 18000,
}: FadeGalleryGridProps) {
  // Calculate how many columns fit the viewport
  const [columns, setColumns] = useState(8);

  useEffect(() => {
    const calcCols = () => {
      const w = window.innerWidth;
      setColumns(Math.max(3, Math.ceil(w / (cardSize + gap)) + 1));
    };
    calcCols();
    window.addEventListener("resize", calcCols);
    return () => window.removeEventListener("resize", calcCols);
  }, [cardSize, gap]);

  const totalSlots = rows * columns;

  // Partition images so each slot gets its own unique subset
  // This guarantees no two slots will ever show the same image
  const slotImages = useMemo(() => {
    if (images.length === 0) return [];

    // Shuffle images with a deterministic-ish spread to avoid clustering
    const shuffled = [...images];
    for (let i = shuffled.length - 1; i > 0; i--) {
      // Use a simple seeded-like swap based on index
      const j = (i * 2654435761) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Divide images evenly across slots
    const result: ShowcaseImage[][] = Array.from({ length: totalSlots }, () => []);
    shuffled.forEach((img, i) => {
      result[i % totalSlots].push(img);
    });

    return result;
  }, [images, totalSlots]);

  // Create staggered timing per slot
  const slotTimings = useMemo(() => {
    return Array.from({ length: totalSlots }, (_, i) => {
      const row = Math.floor(i / columns);
      const col = i % columns;
      const initialDelay = 300 + (row * 400) + (col * 350) + ((i * 173) % 500);
      const interval = minInterval + ((i * 2137 + row * 947 + col * 631) % (maxInterval - minInterval));
      return { initialDelay, interval };
    });
  }, [totalSlots, columns, minInterval, maxInterval]);

  if (images.length === 0) return null;

  return (
    <div className="fade-gallery-grid" style={{ gap }}>
      {Array.from({ length: rows }, (_, rowIdx) => (
        <div key={rowIdx} className="fade-gallery-row" style={{ gap }}>
          {Array.from({ length: columns }, (_, colIdx) => {
            const slotIdx = rowIdx * columns + colIdx;
            const imgs = slotImages[slotIdx];
            const timing = slotTimings[slotIdx];
            if (!imgs || imgs.length === 0) return null;
            return (
              <FadeSlot
                key={`${rowIdx}-${colIdx}`}
                images={imgs}
                initialDelay={timing.initialDelay}
                interval={timing.interval}
                size={cardSize}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default FadeGallery;
