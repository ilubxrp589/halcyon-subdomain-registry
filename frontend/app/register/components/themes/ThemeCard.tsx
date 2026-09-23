"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeThumbnail } from "./ThemeThumbnail";
import type { FluxTheme } from "@/services/api";

interface ThemeCardProps {
  theme: FluxTheme;
  model: "playground" | "animagine";
  styleId?: string; // Selected art style - for full matrix thumbnails
  isSelected: boolean;
  selectionIndex: number; // -1 if not selected, 0-2 if selected
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  viewMode: "grid" | "list";
}

export function ThemeCard({
  theme,
  model,
  styleId,
  isSelected,
  selectionIndex,
  isFavorite,
  onSelect,
  onToggleFavorite,
  viewMode,
}: ThemeCardProps) {
  if (viewMode === "list") {
    return (
      <div
        onClick={onSelect}
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all",
          "border",
          "hover:bg-[hsl(var(--muted))]/50",
          isSelected
            ? "border-[hsl(var(--halcyon-green))] bg-[hsl(var(--halcyon-green))]/10"
            : "border-[hsl(var(--border))] hover:border-[hsl(var(--halcyon-teal))]/50"
        )}
      >
        {/* Thumbnail */}
        <ThemeThumbnail
          themeId={theme.id}
          model={model}
          category={theme.category}
          name={theme.name}
          styleId={styleId}
          className="w-16 h-16 rounded-lg flex-shrink-0"
        />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{theme.name}</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))] capitalize">
            {theme.category}
          </div>
        </div>

        {/* Selection Number */}
        {isSelected && (
          <div className="selection-badge w-8 h-8 text-sm flex-shrink-0">
            {selectionIndex + 1}
          </div>
        )}

        {/* Favorite */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="p-2 hover:bg-[hsl(var(--muted))] rounded-lg flex-shrink-0 transition-colors"
        >
          <Heart
            className={cn(
              "h-5 w-5 transition-colors",
              isFavorite
                ? "fill-red-500 text-red-500"
                : "text-[hsl(var(--muted-foreground))]"
            )}
          />
        </button>
      </div>
    );
  }

  // Grid View
  return (
    <div
      onClick={onSelect}
      className={cn(
        "theme-card relative rounded-xl overflow-hidden cursor-pointer",
        "border-2 transition-all",
        isSelected
          ? "theme-card-selected"
          : "border-transparent hover:border-[hsl(var(--halcyon-teal))]/30"
      )}
    >
      {/* Thumbnail */}
      <ThemeThumbnail
        themeId={theme.id}
        model={model}
        category={theme.category}
        name={theme.name}
        styleId={styleId}
        className="aspect-square"
      />

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

      {/* Content */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="font-medium text-white text-sm truncate">
          {theme.name}
        </div>
        <div className="text-xs text-white/70 capitalize">{theme.category}</div>
      </div>

      {/* Selection Badge */}
      {isSelected && (
        <div className="absolute top-2 right-2 selection-badge w-8 h-8 text-sm shadow-lg">
          {selectionIndex + 1}
        </div>
      )}

      {/* Favorite Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="absolute top-2 left-2 p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
      >
        <Heart
          className={cn(
            "h-4 w-4 transition-colors",
            isFavorite ? "fill-red-500 text-red-500" : "text-white"
          )}
        />
      </button>
    </div>
  );
}
