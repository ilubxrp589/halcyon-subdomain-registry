"use client";

import { useMemo } from "react";
import { MarqueeRow } from "./MarqueeRow";
import { ShowcaseImage } from "@/services/api";

interface RowConfig {
  direction: "left" | "right";
  speed: "slow" | "medium" | "fast";
  cardSize: number;
}

interface ShowcaseGalleryProps {
  images: ShowcaseImage[];
  position: "above" | "below" | "both";
  onCycleComplete?: () => void;
}

// Seeded shuffle so each position gets a different but stable order
function shuffleWithSeed(images: ShowcaseImage[], seed: number): ShowcaseImage[] {
  const arr = [...images];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function ShowcaseGallery({
  images,
  position,
  onCycleComplete,
}: ShowcaseGalleryProps) {
  // Shuffle images differently per position for variety
  const shuffledImages = useMemo(() => {
    const seed = position === "above" ? 42 : position === "below" ? 137 : 99;
    return shuffleWithSeed(images, seed);
  }, [images, position]);

  if (images.length === 0) {
    return null;
  }

  // CSS handles responsive sizing via register.css media queries
  const config: RowConfig = position === "both"
    ? { direction: "right", speed: "slow", cardSize: 240 }
    : position === "below"
      ? { direction: "left", speed: "medium", cardSize: 240 }
      : { direction: "left", speed: "slow", cardSize: 240 };

  return (
    <div className={`showcase-gallery relative ${position === "above" ? "pt-1" : position === "below" ? "pb-1" : ""}`}>
      <MarqueeRow
        key={`row-${position}`}
        images={shuffledImages}
        direction={config.direction}
        speed={config.speed}
        cardSize={config.cardSize}
        gap={8}
        onCycleComplete={onCycleComplete}
      />
    </div>
  );
}

export default ShowcaseGallery;
