"use client";

import { useState, useMemo } from "react";
import { Paintbrush, ChevronDown, Check, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArtStyle, ART_STYLE_CATEGORIES, ArtStyleCategory } from "@/services/api";
import { ScrollableTabs, Tab } from "../common/TabGroup";

// Category display configuration
const categoryConfig: Record<ArtStyleCategory, { label: string; color: string; description: string }> = {
  artistic: {
    label: "Artistic",
    color: "amber",
    description: "Traditional mediums like watercolor, oil, pencil",
  },
  digital: {
    label: "Digital",
    color: "cyan",
    description: "Modern digital art styles",
  },
  film: {
    label: "Film & Photo",
    color: "violet",
    description: "Cinematic and photography looks",
  },
  movements: {
    label: "Art Movements",
    color: "rose",
    description: "Historical art styles and movements",
  },
  rendering: {
    label: "Rendering",
    color: "emerald",
    description: "Image rendering and illustration styles",
  },
  mood: {
    label: "Mood",
    color: "purple",
    description: "Atmosphere and aesthetic styles",
  },
};

interface StyleSelectorProps {
  artStyles: {
    artistic: ArtStyle[];
    digital: ArtStyle[];
    film: ArtStyle[];
    movements: ArtStyle[];
    rendering: ArtStyle[];
    mood: ArtStyle[];
  } | null;
  selectedStyleId: string | null;
  onStyleSelect: (styleId: string | null) => void;
  isLoading?: boolean;
  className?: string;
}

export function StyleSelector({
  artStyles,
  selectedStyleId,
  onStyleSelect,
  isLoading = false,
  className,
}: StyleSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<ArtStyleCategory | "popular">("popular");
  const [isExpanded, setIsExpanded] = useState(false);

  // Get selected style details
  const selectedStyle = useMemo(() => {
    if (!selectedStyleId || !artStyles) return null;
    for (const category of ART_STYLE_CATEGORIES) {
      const style = artStyles[category]?.find((s) => s.id === selectedStyleId);
      if (style) return style;
    }
    return null;
  }, [selectedStyleId, artStyles]);

  // Get all styles flattened
  const allStyles = useMemo(() => {
    if (!artStyles) return [];
    const styles: ArtStyle[] = [];
    ART_STYLE_CATEGORIES.forEach((cat) => {
      styles.push(...(artStyles[cat] || []));
    });
    return styles;
  }, [artStyles]);

  // Popular/recommended styles (curated picks across categories)
  const popularStyles = useMemo(() => {
    if (!artStyles) return [];
    const popularIds = [
      // Most versatile and visually striking
      "cinematic", "watercolor", "anime", "cyberpunk",
      "impressionist", "photorealistic", "pop_art", "dreamy",
      "film_noir", "pixel_art", "ghibli", "art_nouveau",
    ];
    return allStyles.filter((s) => popularIds.includes(s.id));
  }, [allStyles, artStyles]);

  // Get styles for current category
  const currentStyles = useMemo(() => {
    if (activeCategory === "popular") return popularStyles;
    return artStyles?.[activeCategory] || [];
  }, [activeCategory, popularStyles, artStyles]);

  // Build tabs
  const tabs: Tab[] = useMemo(() => {
    const result: Tab[] = [
      { id: "popular", label: "Popular", badge: popularStyles.length },
    ];
    ART_STYLE_CATEGORIES.forEach((cat) => {
      const count = artStyles?.[cat]?.length || 0;
      if (count > 0) {
        result.push({
          id: cat,
          label: categoryConfig[cat].label,
          badge: count,
        });
      }
    });
    return result;
  }, [artStyles, popularStyles.length]);

  if (isLoading) {
    return (
      <div className={cn("space-y-4 animate-pulse", className)}>
        <div className="h-10 bg-secondary/50 rounded-lg" />
        <div className="h-8 bg-secondary/30 rounded-lg" />
        <div className="grid grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 bg-secondary/20 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paintbrush className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Art Style</span>
          <span className="text-xs text-muted-foreground">(optional)</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-7 px-2 gap-1 text-xs"
        >
          {isExpanded ? "Hide" : "Choose Style"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />
        </Button>
      </div>

      {/* Selected Style Display */}
      {selectedStyle ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-gradient-to-r from-primary/10 to-amber-500/10 border border-primary/20">
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{selectedStyle.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {categoryConfig[selectedStyle.category as ArtStyleCategory]?.label || selectedStyle.category} -
              CFG: {selectedStyle.settings.cfg}, Steps: {selectedStyle.settings.steps}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStyleSelect(null)}
            className="h-7 w-7 p-0"
            title="Clear style"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground p-2 bg-secondary/20 rounded-lg">
          No art style selected - using default generation settings
        </div>
      )}

      {/* Expanded Style Selection */}
      {isExpanded && artStyles && (
        <div className="space-y-3 pt-2 border-t border-border">
          {/* Category Tabs */}
          <ScrollableTabs
            tabs={tabs}
            activeTab={activeCategory}
            onTabChange={(id) => setActiveCategory(id as ArtStyleCategory | "popular")}
          />

          {/* Category Description */}
          {activeCategory !== "popular" && (
            <p className="text-xs text-muted-foreground">
              {categoryConfig[activeCategory as ArtStyleCategory]?.description}
            </p>
          )}

          {/* Style Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
            {currentStyles.map((style) => {
              const isSelected = selectedStyleId === style.id;
              const catConfig = categoryConfig[style.category as ArtStyleCategory];
              const colorClass = catConfig?.color || "primary";

              return (
                <button
                  key={style.id}
                  onClick={() => onStyleSelect(isSelected ? null : style.id)}
                  className={cn(
                    "relative px-3 py-2 text-xs text-left rounded-lg border transition-all group",
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-card hover:bg-secondary/80 border-border hover:border-primary/50"
                  )}
                >
                  <span className="block font-medium truncate">{style.name}</span>
                  <span className="block text-[10px] opacity-70 truncate mt-0.5">
                    {style.settings.sampler}
                  </span>
                  {isSelected && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {currentStyles.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              No styles available in this category
            </div>
          )}

          {/* Style Info Footer */}
          <div className="text-[10px] text-muted-foreground pt-2 border-t border-border/50">
            Art styles control <strong>how</strong> your image looks (artistic technique).
            Themes control <strong>what</strong> is in your image (subject matter).
          </div>
        </div>
      )}
    </div>
  );
}
