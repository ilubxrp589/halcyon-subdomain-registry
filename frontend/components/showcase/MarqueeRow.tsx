"use client";

import { useRef, useEffect } from "react";
import { ShowcaseCard } from "./ShowcaseCard";
import { ShowcaseImage } from "@/services/api";

interface MarqueeRowProps {
  images: ShowcaseImage[];
  direction: "left" | "right";
  speed: "slow" | "medium" | "fast";
  cardSize?: number;
  gap?: number;
  onCycleComplete?: () => void;
}

const SPEED_DURATIONS = {
  slow: 600,    // Top/bottom rows
  medium: 750,  // Middle section - slower
  fast: 300,
};

export function MarqueeRow({
  images,
  direction,
  speed,
  cardSize = 220,
  gap = 16,
  onCycleComplete,
}: MarqueeRowProps) {
  // Always use 2 copies — CSS handles responsive sizing via register.css media queries
  const duplicatedImages = [...images, ...images];
  const rowRef = useRef<HTMLDivElement>(null);

  const duration = SPEED_DURATIONS[speed];
  const animationClass = direction === "left" ? "marquee-left" : "marquee-right";

  // Listen for animation iteration to trigger batch swap
  useEffect(() => {
    const el = rowRef.current;
    if (!el || !onCycleComplete) return;

    const handler = () => {
      onCycleComplete();
    };

    el.addEventListener("animationiteration", handler);
    return () => el.removeEventListener("animationiteration", handler);
  }, [onCycleComplete]);

  const isRight = direction === "right";

  return (
    <div
      className="marquee-container overflow-hidden"
      style={isRight ? { transform: "scaleX(-1)" } : undefined}
    >
      <div
        ref={rowRef}
        className="marquee-row marquee-left"
        style={{
          "--duration": `${duration}s`,
          "--card-size": `${cardSize}px`,
          "--gap": `${gap}px`,
          gap: `${gap}px`,
        } as React.CSSProperties}
      >
        {duplicatedImages.map((image, index) => (
          <div
            key={`${image.id}-${index}`}
            style={isRight ? { transform: "scaleX(-1)" } : undefined}
          >
            <ShowcaseCard
              image={image}
              size={cardSize}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default MarqueeRow;
