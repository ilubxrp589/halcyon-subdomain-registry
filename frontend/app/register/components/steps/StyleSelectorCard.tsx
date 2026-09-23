"use client";

import { useState, useMemo } from "react";
import { Paintbrush, SkipForward, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassmorphicCard } from "../ui/GlassmorphicCard";
import { HalcyonButton } from "../ui/AnimatedButton";
import type { ArtStyle } from "@/services/api";

type ArtStylesByCategory = {
  artistic: ArtStyle[];
  digital: ArtStyle[];
  film: ArtStyle[];
  movements: ArtStyle[];
  rendering: ArtStyle[];
  mood: ArtStyle[];
} | null;

interface StyleSelectorCardProps {
  artStyles: ArtStylesByCategory;
  selectedStyleId: string | null;
  onSelect: (styleId: string | null) => void;
  onSkip: () => void;
  isExpanded: boolean;
  isCompleted: boolean;
  onCardClick: () => void;
  isLoading?: boolean;
}

const POPULAR_STYLE_IDS = [
  "cinematic",
  "watercolor",
  "anime",
  "cyberpunk",
  "impressionist",
  "photorealistic",
  "dreamy",
  "film_noir",
];

export function StyleSelectorCard({
  artStyles,
  selectedStyleId,
  onSelect,
  onSkip,
  isExpanded,
  isCompleted,
  onCardClick,
  isLoading = false,
}: StyleSelectorCardProps) {
  const [activeCategory, setActiveCategory] = useState<string>("popular");

  const selectedStyle = useMemo(() => {
    if (!selectedStyleId || !artStyles) return null;
    for (const category of Object.keys(artStyles)) {
      const style = artStyles[category as keyof typeof artStyles]?.find(
        (s) => s.id === selectedStyleId
      );
      if (style) return style;
    }
    return null;
  }, [selectedStyleId, artStyles]);

  const popularStyles = useMemo(() => {
    if (!artStyles) return [];
    const all = Object.values(artStyles).flat();
    return all.filter((s) => POPULAR_STYLE_IDS.includes(s.id));
  }, [artStyles]);

  const displayStyles = useMemo(() => {
    if (!artStyles) return [];
    if (activeCategory === "popular") return popularStyles;
    return artStyles[activeCategory as keyof typeof artStyles] || [];
  }, [artStyles, activeCategory, popularStyles]);

  const categories = artStyles ? Object.keys(artStyles) : [];

  return (
    <GlassmorphicCard
      isExpanded={isExpanded}
      isCompleted={isCompleted}
      isActive={isExpanded && !isCompleted}
      onClick={onCardClick}
      stepNumber={2}
      header={
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[hsl(var(--halcyon-teal))]/20">
            <Paintbrush className="h-5 w-5 text-[hsl(var(--halcyon-teal))]" />
          </div>
          <div>
            <h3 className="font-semibold">Art Style</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Optional visual style
            </p>
          </div>
        </div>
      }
      completedSummary={
        selectedStyle ? (
          <span className="text-[hsl(var(--halcyon-green))] font-medium">
            {selectedStyle.name}
          </span>
        ) : (
          <span className="text-[hsl(var(--muted-foreground))]">No style selected</span>
        )
      }
    >
      {isLoading ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-10 w-24 rounded-lg skeleton-halcyon"
              />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="h-20 rounded-lg skeleton-halcyon"
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Category Tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-thin">
            <button
              className={cn(
                "tab-btn whitespace-nowrap",
                activeCategory === "popular" && "tab-btn-active"
              )}
              onClick={() => setActiveCategory("popular")}
            >
              Popular
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className={cn(
                  "tab-btn whitespace-nowrap capitalize",
                  activeCategory === cat && "tab-btn-active"
                )}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Style Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
            {displayStyles.map((style) => (
              <button
                key={style.id}
                onClick={() =>
                  onSelect(selectedStyleId === style.id ? null : style.id)
                }
                className={cn(
                  "p-3 rounded-lg border transition-all text-left",
                  "hover:border-[hsl(var(--halcyon-teal))]/50",
                  "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--halcyon-teal))]/50",
                  selectedStyleId === style.id
                    ? "border-[hsl(var(--halcyon-green))] bg-[hsl(var(--halcyon-green))]/10"
                    : "border-[hsl(var(--border))]"
                )}
              >
                <span className="font-medium text-sm block truncate">
                  {style.name}
                </span>
                <span className="text-xs text-[hsl(var(--muted-foreground))] mt-1 block">
                  {style.settings.steps} steps
                </span>
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-[hsl(var(--border))]">
            <HalcyonButton variant="ghost" onClick={onSkip}>
              <span className="flex items-center gap-2">
                <SkipForward className="h-4 w-4" />
                Skip Style
              </span>
            </HalcyonButton>
            <HalcyonButton
              variant="primary"
              onClick={() => onSelect(selectedStyleId)}
              disabled={!selectedStyleId}
            >
              <span className="flex items-center gap-2">
                Continue
                <ChevronRight className="h-4 w-4" />
              </span>
            </HalcyonButton>
          </div>
        </>
      )}
    </GlassmorphicCard>
  );
}
