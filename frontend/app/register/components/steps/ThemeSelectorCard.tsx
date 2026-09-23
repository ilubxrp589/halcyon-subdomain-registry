"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Grid3X3,
  Search,
  LayoutGrid,
  List,
  Shuffle,
  Heart,
  X,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassmorphicCard } from "../ui/GlassmorphicCard";
import { HalcyonButton } from "../ui/AnimatedButton";
import { ThemeCard } from "../themes/ThemeCard";
import type { FluxTheme } from "@/services/api";

type FluxThemesByCategory = {
  business: FluxTheme[];
  exotic: FluxTheme[];
  jobs: FluxTheme[];
  fantasy: FluxTheme[];
  fractal: FluxTheme[];
  nature: FluxTheme[];
  space: FluxTheme[];
  anime: FluxTheme[];
};

interface ThemeSelectorCardProps {
  themes: FluxThemesByCategory;
  selectedTheme: string | null;
  onSelectTheme: (themeId: string) => void;
  onConfirm: () => void;
  onGenerateDirectly?: () => void; // When provided, shows "Generate" button for quick re-generation
  model: "playground" | "animagine";
  selectedStyleId?: string; // Selected art style for full matrix thumbnails
  favorites: string[];
  onToggleFavorite: (themeId: string) => void;
  onRandomSelection: () => void;
  isExpanded: boolean;
  isCompleted: boolean;
  onCardClick: () => void;
}

export function ThemeSelectorCard({
  themes,
  selectedTheme,
  onSelectTheme,
  onConfirm,
  onGenerateDirectly,
  model,
  selectedStyleId,
  favorites,
  onToggleFavorite,
  onRandomSelection,
  isExpanded,
  isCompleted,
  onCardClick,
}: ThemeSelectorCardProps) {
  const [activeTab, setActiveTab] = useState<string>("favorites");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Get categories based on model
  const categories = useMemo(() => {
    if (model === "animagine") {
      return ["favorites", "anime"];
    }
    return [
      "favorites",
      "exotic",
      "fantasy",
      "space",
      "fractal",
      "nature",
      "jobs",
      "business",
    ];
  }, [model]);

  // Get all themes for current model
  const allThemesForModel = useMemo(() => {
    if (model === "animagine") {
      return themes.anime || [];
    }
    return [
      ...(themes.exotic || []),
      ...(themes.fantasy || []),
      ...(themes.space || []),
      ...(themes.fractal || []),
      ...(themes.nature || []),
      ...(themes.jobs || []),
      ...(themes.business || []),
    ];
  }, [themes, model]);

  // Get themes for current tab
  const displayThemes = useMemo(() => {
    let result: FluxTheme[] = [];

    if (activeTab === "favorites") {
      result = allThemesForModel.filter((t) => favorites.includes(t.id));
    } else if (activeTab === "all") {
      result = allThemesForModel;
    } else {
      result = themes[activeTab as keyof FluxThemesByCategory] || [];
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(query) ||
          t.id.toLowerCase().includes(query)
      );
    }

    return result;
  }, [themes, activeTab, favorites, searchQuery, allThemesForModel]);

  const getThemeCount = useCallback(
    (cat: string) => {
      if (cat === "favorites") return favorites.length;
      if (cat === "all") return allThemesForModel.length;
      return themes[cat as keyof FluxThemesByCategory]?.length || 0;
    },
    [themes, favorites.length, allThemesForModel.length]
  );

  const getSelectedThemeName = useCallback(() => {
    if (!selectedTheme) return "";
    const theme = allThemesForModel.find((t) => t.id === selectedTheme);
    return theme?.name || selectedTheme;
  }, [selectedTheme, allThemesForModel]);

  return (
    <GlassmorphicCard
      isExpanded={isExpanded}
      isCompleted={isCompleted}
      isActive={isExpanded && !isCompleted}
      onClick={onCardClick}
      stepNumber={3}
      header={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[hsl(var(--halcyon-teal))]/20">
              <Grid3X3 className="h-5 w-5 text-[hsl(var(--halcyon-teal))]" />
            </div>
            <div>
              <h3 className="font-semibold">Select Theme</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Choose a theme for your NFT
              </p>
            </div>
          </div>

          {/* Selection Counter Badge */}
          <div
            className={cn(
              "px-3 py-1 rounded-full text-sm font-medium",
              selectedTheme
                ? "bg-[hsl(var(--halcyon-green))]/20 text-[hsl(var(--halcyon-green))]"
                : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
            )}
          >
            {selectedTheme ? "1" : "0"}/1
          </div>
        </div>
      }
      completedSummary={
        <span className="text-[hsl(var(--halcyon-green))] font-medium">
          {getSelectedThemeName()}
        </span>
      }
    >
      {/* Search & View Controls */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <input
            type="text"
            placeholder="Search themes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[hsl(var(--background))]/50 border border-[hsl(var(--border))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--halcyon-teal))]/50 text-sm"
          />
        </div>

        <div className="flex gap-1 p-1 rounded-lg bg-[hsl(var(--muted))]/50">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "p-2 rounded transition-colors",
              viewMode === "grid"
                ? "bg-[hsl(var(--background))] shadow"
                : "hover:bg-[hsl(var(--background))]/50"
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "p-2 rounded transition-colors",
              viewMode === "list"
                ? "bg-[hsl(var(--background))] shadow"
                : "hover:bg-[hsl(var(--background))]/50"
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {/* Random Button */}
        <HalcyonButton variant="outline" size="sm" onClick={onRandomSelection}>
          <span className="flex items-center gap-2">
            <Shuffle className="h-4 w-4" />
            Random
          </span>
        </HalcyonButton>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-thin">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={cn(
              "tab-btn whitespace-nowrap flex items-center gap-1",
              activeTab === cat && "tab-btn-active"
            )}
          >
            {cat === "favorites" && <Heart className="h-4 w-4" />}
            <span className="capitalize">{cat}</span>
            <span className="text-xs opacity-70">({getThemeCount(cat)})</span>
          </button>
        ))}
        <button
          onClick={() => setActiveTab("all")}
          className={cn(
            "tab-btn whitespace-nowrap",
            activeTab === "all" && "tab-btn-active"
          )}
        >
          All Themes
          <span className="ml-1 text-xs opacity-70">
            ({allThemesForModel.length})
          </span>
        </button>
      </div>

      {/* Theme Grid */}
      <div
        className={cn(
          "max-h-[400px] overflow-y-auto pr-2 scrollbar-thin",
          viewMode === "grid"
            ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
            : "space-y-2"
        )}
      >
        {displayThemes.length === 0 ? (
          <div className="col-span-full py-12 text-center text-[hsl(var(--muted-foreground))]">
            {activeTab === "favorites"
              ? "No favorites yet. Click the heart on themes to add them!"
              : searchQuery
                ? `No themes found for "${searchQuery}"`
                : "No themes found"}
          </div>
        ) : (
          displayThemes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              model={model}
              styleId={selectedStyleId}
              isSelected={selectedTheme === theme.id}
              selectionIndex={selectedTheme === theme.id ? 0 : -1}
              isFavorite={favorites.includes(theme.id)}
              onSelect={() => onSelectTheme(theme.id)}
              onToggleFavorite={() => onToggleFavorite(theme.id)}
              viewMode={viewMode}
            />
          ))
        )}
      </div>

      {/* Selected Theme Preview */}
      {selectedTheme && (
        <div className="mt-4 p-3 rounded-lg bg-[hsl(var(--muted))]/30">
          <div className="text-sm font-medium mb-2">Selected Theme:</div>
          <div className="flex gap-2 flex-wrap">
            {(() => {
              const theme = allThemesForModel.find((t) => t.id === selectedTheme);
              return (
                <div
                  className="flex items-center gap-2 px-3 py-1 rounded-full bg-[hsl(var(--halcyon-teal))]/20"
                >
                  <span className="text-sm">{theme?.name || selectedTheme}</span>
                  <button
                    onClick={() => onSelectTheme(selectedTheme)}
                    className="hover:text-[hsl(var(--destructive))] transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Confirm / Generate Button */}
      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[hsl(var(--border))]">
        {onGenerateDirectly ? (
          <>
            <HalcyonButton
              variant="outline"
              onClick={onConfirm}
              disabled={!selectedTheme}
            >
              Continue to Prompt
            </HalcyonButton>
            <HalcyonButton
              variant="primary"
              onClick={onGenerateDirectly}
              disabled={!selectedTheme}
            >
              Generate Now
            </HalcyonButton>
          </>
        ) : (
          <HalcyonButton
            variant="primary"
            onClick={onConfirm}
            disabled={!selectedTheme}
          >
            <span className="flex items-center gap-2">
              Continue with Theme
              <ChevronRight className="h-4 w-4" />
            </span>
          </HalcyonButton>
        )}
      </div>
    </GlassmorphicCard>
  );
}
