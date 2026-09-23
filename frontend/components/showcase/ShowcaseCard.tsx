"use client";

import { useState } from "react";
import { ShowcaseImage } from "@/services/api";

interface ShowcaseCardProps {
  image: ShowcaseImage;
  size?: number;
}

export function ShowcaseCard({ image, size = 220 }: ShowcaseCardProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const label = [image.styleName, image.themeName].filter(Boolean).join(" — ");

  return (
    <div
      className="showcase-card flex-shrink-0 relative group"
      style={{
        width: size,
        height: size,
      }}
    >
      {/* Gradient border background */}
      <div
        className="absolute inset-0 rounded-2xl p-[2px]"
        style={{
          background: "linear-gradient(135deg, hsl(var(--halcyon-teal) / 0.3), hsl(var(--halcyon-green) / 0.3))"
        }}
      >
        <div className="w-full h-full rounded-2xl bg-background/80 overflow-hidden">
          {!hasError ? (
            <img
              src={image.url}
              alt={image.domain || "Showcase NFT"}
              width={size}
              height={size}
              className={`w-full h-full object-cover transition-all duration-500 ${
                isLoaded ? "opacity-100 scale-100" : "opacity-0 scale-95"
              }`}
              onLoad={() => setIsLoaded(true)}
              onError={() => setHasError(true)}
              loading="lazy"
            />
          ) : (
            // Fallback gradient
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, hsl(var(--halcyon-teal) / 0.2), hsl(var(--halcyon-green) / 0.2))"
              }}
            >
              <span className="text-4xl opacity-50">🎨</span>
            </div>
          )}
        </div>
      </div>

      {/* Style/theme label overlay on hover */}
      {label && (
        <div
          className="absolute bottom-0 left-0 right-0 px-2 py-1.5 rounded-b-2xl
                     opacity-0 group-hover:opacity-100 transition-opacity duration-300
                     pointer-events-none"
          style={{
            background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
          }}
        >
          <p className="text-xs text-white/90 truncate text-center font-medium">
            {label}
          </p>
        </div>
      )}

      {/* Glow effect on hover */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          boxShadow: "0 0 30px rgba(212, 175, 55, 0.3)"
        }}
      />
    </div>
  );
}

export default ShowcaseCard;
