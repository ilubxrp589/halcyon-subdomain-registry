"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Shuffle, Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FluxTheme, ImageStyle, IMAGE_STYLES, ImageStyleOption } from "@/services/api";
import { ScrollableTabs, Tab } from "../common/TabGroup";
import { SelectedThemes } from "../common/ThemeChip";

// Flux-specific theme categories (subset of ThemeCategory)
type FluxCategory = "business" | "exotic" | "jobs" | "fantasy" | "fractal" | "nature" | "space" | "anime";

// Curated themes for launch - best 100 themes for NFT art
// All 350 themes still exist in backend, this just controls what's shown
const CURATED_THEME_IDS = new Set([
  // ========== EXOTIC (30) - Surreal, artistic, unique ==========
  "51_melting_clocks",
  "52_biolum_city",
  "53_floating_islands",
  "54_cyber_samurai",
  "55_ghost_forest",
  "56_airship_battle",
  "57_flying_books",
  "58_cosmic_whale",
  "59_overgrown_ruins",
  "60_gothic_mansion",
  "61_geometric_portal",
  "62_crystal_phoenix",
  "63_synthwave_highway",
  "64_magic_mirror",
  "65_ice_palace",
  "66_mech_heart",
  "67_living_chess",
  "68_alien_jungle",
  "69_time_traveler",
  "70_space_blossoms",
  "73_atlantis",
  "74_cyber_cat",
  "76_cloud_city",
  "77_elder_god",
  "79_vampire_ball",
  "80_solarpunk_village",
  "84_volcano_dragon",
  "92_unicorn_herd",
  "98_glass_wings",
  "100_apocalypse_bloom",
  // ========== FANTASY (24) - Epic, imaginative ==========
  "151_crimson_moon",
  "152_clockwork_birds",
  "153_cyber_orchid",
  "154_glass_cathedral",
  "156_polar_guardian",
  "159_memory_willow",
  "160_zeppelin_graveyard",
  "162_jellyfish_stars",
  "163_golem_blossoms",
  "166_solar_butterflies",
  "168_emerald_dragon",
  "170_silk_weaver",
  "174_obsidian_phoenix",
  "175_living_graffiti",
  "176_black_hole_library",
  "180_nuclear_cherry",
  "184_digital_geisha",
  "186_plasma_surfer",
  "188_neon_heart_tree",
  "190_galaxy_eye",
  "191_lantern_sea",
  "195_ghost_train",
  "198_living_typewriter",
  "200_event_horizon_ballerina",
  // ========== SPACE (22) - Cosmic, sci-fi ==========
  "01_nebula_nursery",
  "02_black_hole_horizon",
  "03_lunar_colony",
  "04_mars_terraforming",
  "09_interstellar_ark",
  "10_alien_megacity",
  "12_comet_rider",
  "14_europa_ocean",
  "16_supernova_remnant",
  "17_zero_g_garden",
  "19_quantum_stargate",
  "22_exoplanet_vista",
  "23_space_whale_pod",
  "25_crystalline_asteroid",
  "26_binary_star_sunset",
  "31_ringworld_horizon",
  "34_stellar_forge",
  "37_cosmic_jellyfish",
  "46_cosmic_reef",
  "47_starship_graveyard",
  "48_dimensional_rift",
  "50_event_horizon_hotel",
  // ========== FRACTAL (14) - Psychedelic ==========
  "201_fractal_eyes",
  "203_kaleidoscope_shatter",
  "206_dmt_portal",
  "207_nebula_brain",
  "208_galaxy_serpent",
  "210_black_hole_heart",
  "211_neon_syrup_city",
  "217_inverted_aurora_forest",
  "221_galaxy_face",
  "225_stained_glass_skin",
  "226_escher_singularity",
  "233_blacklight_alive",
  "239_consciousness_lotus",
  "240_rainbow_serpent",
  // ========== NATURE (8) - Visually striking ==========
  "304_nocturnal_life",
  "313_ancient_trees",
  "315_fungi_kingdom",
  "326_volcanoes",
  "328_starry_nights",
  "333_endangered_species",
  "345_biomimicry",
  "350_natures_geometry",
  // ========== JOBS (2) - Kept minimal ==========
  "115_balloon_pilot",
  "125_storm_chaser",
  // ========== ANIME (25) - Animagine XL 3.1 optimized ==========
  "01_magical_girl",
  "02_mecha_pilot",
  "03_isekai_hero",
  "04_school_life",
  "05_cyberpunk_anime",
  "06_samurai_spirit",
  "07_idol_stage",
  "08_beach_episode",
  "09_fantasy_adventure",
  "10_ninja_shadow",
  "11_demon_slayer",
  "12_chibi_cute",
  "13_shonen_battle",
  "14_romance_scene",
  "15_horror_anime",
  "16_sports_anime",
  "17_cooking_anime",
  "18_music_anime",
  "19_yokai_encounter",
  "20_space_opera",
  "21_gothic_lolita",
  "22_steampunk_anime",
  "23_underwater_world",
  "24_winter_wonderland",
  "25_festival_night",
  // ========== ANIME LANDSCAPES (12) ==========
  "ls_01_cherry_blossom",
  "ls_02_sunset_shrine",
  "ls_03_floating_islands",
  "ls_04_neon_city",
  "ls_05_enchanted_forest",
  "ls_06_ocean_cliff",
  "ls_07_mountain_temple",
  "ls_08_autumn_village",
  "ls_09_starry_meadow",
  "ls_10_crystal_cave",
  "ls_11_bamboo_grove",
  "ls_12_volcanic_land",
  // ========== ANIME SCI-FI (12) ==========
  "sf_01_cyberpunk_city",
  "sf_02_space_station",
  "sf_03_android",
  "sf_04_starship_bridge",
  "sf_05_virtual_world",
  "sf_06_mech_hangar",
  "sf_07_alien_planet",
  "sf_08_hacker",
  "sf_09_bio_lab",
  "sf_10_post_apocalyptic",
  "sf_11_time_traveler",
  "sf_12_space_pilot",
  // ========== ANIME CREATURES (12) ==========
  "cr_01_dragon",
  "cr_02_phoenix",
  "cr_03_kitsune",
  "cr_04_cute_mascot",
  "cr_05_wolf_spirit",
  "cr_06_slime",
  "cr_07_unicorn",
  "cr_08_tanuki",
  "cr_09_fairy_dragon",
  "cr_10_oni",
  "cr_11_cat_spirit",
  "cr_12_water_dragon",
]);

// Theme category configuration
export const themeCategories = {
  popular: {
    label: "Popular",
    color: "yellow",
    themes: [] as string[], // Will be populated from usage data
  },
  business: {
    label: "Business",
    color: "green",
  },
  exotic: {
    label: "Exotic",
    color: "purple",
  },
  jobs: {
    label: "Jobs",
    color: "cyan",
  },
  fantasy: {
    label: "Fantasy",
    color: "rose",
  },
  fractal: {
    label: "Fractal",
    color: "amber",
  },
  nature: {
    label: "Nature",
    color: "teal",
  },
  space: {
    label: "Space",
    color: "indigo",
  },
  anime: {
    label: "Anime",
    color: "pink",
  },
};

type CategoryKey = keyof typeof themeCategories;

const categoryColorMap: Record<string, string> = {
  business: "green",
  exotic: "purple",
  jobs: "cyan",
  fantasy: "rose",
  fractal: "amber",
  nature: "teal",
  space: "indigo",
  anime: "pink",
  popular: "yellow",
};

interface ThemeSelectorProps {
  fluxThemes: {
    business: FluxTheme[];
    exotic: FluxTheme[];
    jobs: FluxTheme[];
    fantasy: FluxTheme[];
    fractal: FluxTheme[];
    nature: FluxTheme[];
    space: FluxTheme[];
    anime: FluxTheme[];
  };
  selectedTheme: string | null;
  onThemeSelect: (themeId: string) => void;
  onRandomTheme: () => void;
  selectedStyle: ImageStyle;
  onStyleChange: (style: ImageStyle) => void;
  availableStyles?: ImageStyleOption[];
  gpusAvailable: number;
  className?: string;
}

export function ThemeSelector({
  fluxThemes,
  selectedTheme,
  onThemeSelect,
  onRandomTheme,
  selectedStyle,
  onStyleChange,
  availableStyles = IMAGE_STYLES,
  gpusAvailable,
  className,
}: ThemeSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryKey | "all">("popular");
  const [searchQuery, setSearchQuery] = useState("");

  // Determine if we're in anime mode
  const isAnimeStyle = selectedStyle === 'animagine';

  // Reset category when style changes (anime tabs don't exist in photorealistic mode and vice versa)
  useEffect(() => {
    setActiveCategory("popular");
    setSearchQuery("");
  }, [selectedStyle]);

  // Get all themes flattened (filtered to curated list only, and by style)
  const allThemes = useMemo(() => {
    const themes: Array<FluxTheme & { category: FluxCategory }> = [];
    (Object.keys(fluxThemes) as Array<keyof typeof fluxThemes>).forEach((cat) => {
      // Filter by style: anime themes for anime style, non-anime for photorealistic
      if (isAnimeStyle && cat !== 'anime') return;
      if (!isAnimeStyle && cat === 'anime') return;

      const categoryThemes = fluxThemes[cat] || [];
      categoryThemes
        .filter((theme) => CURATED_THEME_IDS.has(theme.id))
        .forEach((theme) => {
          themes.push({ ...theme, category: cat as FluxCategory });
        });
    });
    return themes;
  }, [fluxThemes, isAnimeStyle]);

  // Get curated themes per category (filtered by style)
  // Always return consistent shape with empty arrays for irrelevant categories
  const curatedFluxThemes = useMemo(() => {
    const allAnime = (fluxThemes.anime || []).filter((t) => CURATED_THEME_IDS.has(t.id));
    // Split anime into characters (no prefix), landscapes (ls_), sci-fi (sf_), creatures (cr_)
    const animeCharacters = allAnime.filter((t) => !t.id.startsWith('ls_') && !t.id.startsWith('sf_') && !t.id.startsWith('cr_'));
    const animeLandscapes = allAnime.filter((t) => t.id.startsWith('ls_'));
    const animeSciFi = allAnime.filter((t) => t.id.startsWith('sf_'));
    const animeCreatures = allAnime.filter((t) => t.id.startsWith('cr_'));

    if (isAnimeStyle) {
      // Only anime themes for anime style
      return {
        business: [] as FluxTheme[],
        exotic: [] as FluxTheme[],
        jobs: [] as FluxTheme[],
        fantasy: [] as FluxTheme[],
        fractal: [] as FluxTheme[],
        nature: [] as FluxTheme[],
        space: [] as FluxTheme[],
        anime: allAnime,
        animeCharacters,
        animeLandscapes,
        animeSciFi,
        animeCreatures,
      };
    }
    // Non-anime themes for photorealistic style
    return {
      business: (fluxThemes.business || []).filter((t) => CURATED_THEME_IDS.has(t.id)),
      exotic: (fluxThemes.exotic || []).filter((t) => CURATED_THEME_IDS.has(t.id)),
      jobs: (fluxThemes.jobs || []).filter((t) => CURATED_THEME_IDS.has(t.id)),
      fantasy: (fluxThemes.fantasy || []).filter((t) => CURATED_THEME_IDS.has(t.id)),
      fractal: (fluxThemes.fractal || []).filter((t) => CURATED_THEME_IDS.has(t.id)),
      nature: (fluxThemes.nature || []).filter((t) => CURATED_THEME_IDS.has(t.id)),
      space: (fluxThemes.space || []).filter((t) => CURATED_THEME_IDS.has(t.id)),
      anime: [] as FluxTheme[],
      animeCharacters: [] as FluxTheme[],
      animeLandscapes: [] as FluxTheme[],
      animeSciFi: [] as FluxTheme[],
      animeCreatures: [] as FluxTheme[],
    };
  }, [fluxThemes, isAnimeStyle]);

  // Get popular themes (different picks for anime vs photorealistic)
  const popularThemes = useMemo(() => {
    const popular: Array<FluxTheme & { category: FluxCategory }> = [];

    // Different popular picks based on style
    const popularIds = isAnimeStyle
      ? [
          // Popular anime character themes
          "01_magical_girl", "02_mecha_pilot", "05_cyberpunk_anime",
          "06_samurai_spirit", "11_demon_slayer", "03_isekai_hero",
          // Popular anime landscapes
          "ls_01_cherry_blossom", "ls_03_floating_islands", "ls_09_starry_meadow",
          // Popular anime sci-fi
          "sf_01_cyberpunk_city", "sf_03_android", "sf_12_space_pilot",
          // Popular anime creatures
          "cr_01_dragon", "cr_03_kitsune", "cr_04_cute_mascot",
        ]
      : [
          // Popular photorealistic themes (original list)
          "54_cyber_samurai", "58_cosmic_whale", "63_synthwave_highway",
          "168_emerald_dragon", "190_galaxy_eye", "02_black_hole_horizon",
          "23_space_whale_pod", "206_dmt_portal", "84_volcano_dragon",
          "62_crystal_phoenix", "191_lantern_sea", "37_cosmic_jellyfish",
          "56_airship_battle", "154_glass_cathedral", "31_ringworld_horizon",
          "221_galaxy_face", "74_cyber_cat", "176_black_hole_library",
        ];

    popularIds.forEach((id) => {
      const theme = allThemes.find((t) => t.id === id);
      if (theme) popular.push(theme);
    });
    return popular;
  }, [allThemes, isAnimeStyle]);

  // Filter themes based on category and search
  const filteredThemes = useMemo(() => {
    let themes: Array<FluxTheme & { category: FluxCategory }> = [];

    if (activeCategory === "all") {
      themes = allThemes;
    } else if (activeCategory === "popular") {
      themes = popularThemes;
    } else if ((activeCategory as string) === "animeCharacters" || (activeCategory as string) === "animeLandscapes" || (activeCategory as string) === "animeSciFi" || (activeCategory as string) === "animeCreatures") {
      // Special handling for anime sub-categories
      const cat = activeCategory as string;
      const categoryThemes = cat === "animeCharacters"
        ? curatedFluxThemes.animeCharacters
        : cat === "animeLandscapes"
        ? curatedFluxThemes.animeLandscapes
        : cat === "animeSciFi"
        ? curatedFluxThemes.animeSciFi
        : curatedFluxThemes.animeCreatures;
      themes = (categoryThemes || []).map((t) => ({
        ...t,
        category: "anime" as FluxCategory, // Map back to anime for display
      }));
    } else if (activeCategory in curatedFluxThemes) {
      const categoryThemes = curatedFluxThemes[activeCategory as keyof typeof curatedFluxThemes];
      themes = (categoryThemes || []).map((t) => ({
        ...t,
        category: activeCategory as FluxCategory,
      }));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      themes = themes.filter((t) => t.name.toLowerCase().includes(query));
    }

    return themes;
  }, [activeCategory, allThemes, popularThemes, curatedFluxThemes, searchQuery]);

  // Get selected theme details
  const selectedThemeDetails = useMemo(() => {
    if (!selectedTheme) return null;
    const theme = allThemes.find((t) => t.id === selectedTheme);
    return theme ? { id: theme.id, name: theme.name, category: theme.category } : null;
  }, [selectedTheme, allThemes]);

  // Build tabs (different for anime vs photorealistic)
  const tabs: Tab[] = useMemo(() => {
    const result: Tab[] = [
      { id: "popular", label: "Popular", badge: popularThemes.length },
    ];

    if (isAnimeStyle) {
      // Anime mode: show Characters, Landscapes, Sci-Fi, and Creatures
      if (curatedFluxThemes.animeCharacters.length > 0) {
        result.push({ id: "animeCharacters", label: "Characters", badge: curatedFluxThemes.animeCharacters.length });
      }
      if (curatedFluxThemes.animeLandscapes.length > 0) {
        result.push({ id: "animeLandscapes", label: "Landscapes", badge: curatedFluxThemes.animeLandscapes.length });
      }
      if (curatedFluxThemes.animeSciFi.length > 0) {
        result.push({ id: "animeSciFi", label: "Sci-Fi", badge: curatedFluxThemes.animeSciFi.length });
      }
      if (curatedFluxThemes.animeCreatures.length > 0) {
        result.push({ id: "animeCreatures", label: "Creatures", badge: curatedFluxThemes.animeCreatures.length });
      }
    } else {
      // Photorealistic mode: show all non-anime categories
      if (curatedFluxThemes.exotic.length > 0) {
        result.push({ id: "exotic", label: "Exotic", badge: curatedFluxThemes.exotic.length });
      }
      if (curatedFluxThemes.fantasy.length > 0) {
        result.push({ id: "fantasy", label: "Fantasy", badge: curatedFluxThemes.fantasy.length });
      }
      if (curatedFluxThemes.space.length > 0) {
        result.push({ id: "space", label: "Space", badge: curatedFluxThemes.space.length });
      }
      if (curatedFluxThemes.fractal.length > 0) {
        result.push({ id: "fractal", label: "Fractal", badge: curatedFluxThemes.fractal.length });
      }
      if (curatedFluxThemes.nature.length > 0) {
        result.push({ id: "nature", label: "Nature", badge: curatedFluxThemes.nature.length });
      }
      if (curatedFluxThemes.jobs.length > 0) {
        result.push({ id: "jobs", label: "Jobs", badge: curatedFluxThemes.jobs.length });
      }
    }

    // Only show "All" tab for photorealistic (anime already has "All Anime")
    if (!isAnimeStyle) {
      result.push({ id: "all", label: "All", badge: allThemes.length });
    }
    return result;
  }, [popularThemes.length, curatedFluxThemes, allThemes.length, isAnimeStyle]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with selection status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Select Theme</span>
          <Badge variant="outline" className="text-xs">
            {gpusAvailable} GPUs ready
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRandomTheme}
            className="h-7 px-2 gap-1 text-xs"
            title="Select random theme"
          >
            <Shuffle className="h-3 w-3" />
            Random
          </Button>
          <Badge
            variant={selectedTheme ? "default" : "secondary"}
            className={cn(
              "font-mono",
              selectedTheme && "bg-green-500 hover:bg-green-600"
            )}
          >
            {selectedTheme ? "1" : "0"}/1
          </Badge>
        </div>
      </div>

      {/* Style Picker */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-primary/5 to-amber-500/5 border border-primary/20">
        <span className="text-sm font-medium text-muted-foreground">Style:</span>
        <div className="flex gap-2">
          {availableStyles.map((style) => (
            <button
              key={style.id}
              onClick={() => onStyleChange(style.id)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                selectedStyle === style.id
                  ? style.id === "playground"
                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-500/25"
                    : "bg-gradient-to-r from-amber-500 to-yellow-600 text-white shadow-lg shadow-amber-500/25"
                  : "bg-secondary/50 hover:bg-secondary text-foreground border border-border hover:border-primary/30"
              )}
              title={style.description}
            >
              {style.name}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {selectedStyle === "playground"
            ? "Photorealistic rendering"
            : "Anime style art"}
        </span>
      </div>

      {/* Selected Theme Display */}
      {selectedThemeDetails && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/30">
          <span className="text-sm text-muted-foreground">Selected:</span>
          <Badge variant="default" className="bg-primary">
            {selectedThemeDetails.name}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onThemeSelect(selectedThemeDetails.id)}
            className="h-6 w-6 p-0 ml-auto"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Category Tabs */}
      <ScrollableTabs
        tabs={tabs}
        activeTab={activeCategory}
        onTabChange={(id) => setActiveCategory(id as CategoryKey | "all")}
      />

      {/* Search (only shown for "all" category) */}
      {activeCategory === "all" && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search themes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Theme Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 max-h-64 overflow-y-auto pr-1">
        {filteredThemes.map((theme) => {
          const isSelected = selectedTheme === theme.id;
          const colorClass = categoryColorMap[theme.category] || "green";

          return (
            <button
              key={theme.id}
              onClick={() => onThemeSelect(theme.id)}
              className={cn(
                "relative px-3 py-2 text-xs text-left rounded-lg border transition-all",
                isSelected
                  ? `bg-${colorClass}-500 text-white border-${colorClass}-600 shadow-sm`
                  : `bg-card hover:bg-${colorClass}-50 dark:hover:bg-${colorClass}-950/30 border-border hover:border-${colorClass}-400`
              )}
              style={{
                backgroundColor: isSelected
                  ? `var(--${colorClass}-500, hsl(var(--primary)))`
                  : undefined,
              }}
            >
              <span className="block truncate pr-5">{theme.name}</span>
              {isSelected && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                  <Check className="h-3 w-3" />
                </span>
              )}
              {!isSelected && activeCategory === "all" && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full block",
                      `bg-${colorClass}-500`
                    )}
                    style={{
                      backgroundColor: `var(--${colorClass}-500, hsl(var(--muted-foreground)))`,
                    }}
                  />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filteredThemes.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No themes found matching "{searchQuery}"
        </div>
      )}
    </div>
  );
}
