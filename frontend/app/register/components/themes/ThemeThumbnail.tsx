"use client";

import { useState, useEffect } from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const THUMBNAIL_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface ThemeThumbnailProps {
  themeId: string;
  model: "playground" | "animagine";
  category: string;
  name: string;
  styleId?: string; // Optional style - if provided, shows style-specific thumbnail
  className?: string;
}

export function ThemeThumbnail({
  themeId,
  model,
  category,
  name,
  styleId,
  className,
}: ThemeThumbnailProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Reset states when styleId changes
  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [styleId, themeId]);

  // Generate a color based on theme id for fallback
  const getThemeColor = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 60%, 45%)`;
  };

  // Thumbnail URL pattern - includes style if provided for full matrix support
  // Pattern: /static/theme-thumbnails/{style}_{category}_{themeId}.webp (with style)
  // Pattern: /static/theme-thumbnails/{model}_{category}_{themeId}.webp (without style, legacy)
  const thumbnailUrl = styleId
    ? `${THUMBNAIL_BASE}/static/theme-thumbnails/${styleId}_${category}_${themeId}.webp`
    : `${THUMBNAIL_BASE}/static/theme-thumbnails/${model}_${category}_${themeId}.webp`;

  return (
    <div
      className={cn("relative overflow-hidden bg-[hsl(var(--muted))]", className)}
    >
      {/* Loading State */}
      {!loaded && !error && (
        <div className="absolute inset-0 skeleton-halcyon" />
      )}

      {/* Error Fallback - Gradient with initial */}
      {error && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-2"
          style={{
            background: `linear-gradient(135deg, ${getThemeColor(themeId)}, ${getThemeColor(themeId + "alt")})`,
          }}
        >
          <ImageIcon className="h-6 w-6 text-white/70 mb-1" />
          <span className="text-xs text-center text-white/80 line-clamp-2 font-medium">
            {name}
          </span>
        </div>
      )}

      {/* Actual Image */}
      {!error && (
        <img
          src={thumbnailUrl}
          alt={name}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0"
          )}
        />
      )}
    </div>
  );
}
