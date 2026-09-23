"use client";

import { useState } from "react";
import { Lightbulb, ChevronDown, Zap, Camera, Palette, Sparkles, Focus, Film, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

// Playground v2.5 specific prompting tips (2026 optimized)
export const playgroundTips = {
  general: [
    "Start with your main subject, then add style and mood",
    "Use quality boosters: 'highly detailed', '8k resolution', 'sharp focus'",
    "Combine unexpected styles for unique results",
    "Be specific about materials: 'liquid metal', 'iridescent chrome', 'translucent glass'",
    "Add film style: 'RAW photo', 'analog film grain', 'Kodak Portra 400'",
  ],
  texture: [
    "detailed skin texture",
    "subsurface scattering",
    "micro-pores",
    "tactile fabric weave",
    "sigma 85mm f/1.4 lens",
    "slight chromatic aberration",
  ],
  lighting: {
    cinematic: [
      "rim lighting",
      "volumetric fog",
      "dramatic shadows",
      "golden hour glow",
    ],
    studio: [
      "softbox lighting",
      "high-key lighting",
      "octa-light",
      "reflector disc catchlights",
    ],
    futuristic: [
      "neon accents",
      "cyberpunk palette",
      "bioluminescent lighting",
      "ray-traced reflections",
    ],
  },
  composition: {
    general: [
      "centered composition",
      "rule of thirds",
      "bird's eye view",
      "close-up portrait",
      "wide angle",
    ],
    action: [
      "dynamic angle",
      "low-angle hero shot",
      "motion blur",
      "frozen in mid-air",
      "telephoto compression",
    ],
    background: [
      "bokeh",
      "out-of-focus background",
      "solid black background",
    ],
  },
  negativePrompts: [
    "cartoonish",
    "plastic skin",
    "mutated hands",
    "extra fingers",
    "blurry",
    "low-quality",
    "watermark",
    "text",
    "deformed anatomy",
    "clipping",
    "oversaturated",
  ],
  sportsEnhancers: {
    soccer: ["stadium grass debris", "sweat-beaded forehead", "mesh jersey texture"],
    winter: ["crystalline snow spray", "polarized goggle reflections", "high-altitude blue sky"],
    techSports: ["holographic scoreboard", "LED jersey patterns", "augmented reality overlay"],
  },
  themeCombos: [
    {
      themes: ["Cyberpunk", "Neon", "Portrait"],
      result: "Futuristic character art",
    },
    {
      themes: ["Watercolor", "Nature", "Soft lighting"],
      result: "Dreamy landscapes",
    },
    {
      themes: ["3D Render", "Geometric", "Metallic"],
      result: "Abstract sculptures",
    },
    {
      themes: ["Fantasy", "Ethereal", "Magic"],
      result: "Mystical scenes",
    },
    {
      themes: ["Sports", "Dynamic", "Stadium"],
      result: "Athletic action shots",
    },
    {
      themes: ["RAW photo", "Portra 400", "Portrait"],
      result: "Film-quality photography",
    },
  ],
};

interface PlaygroundTipsProps {
  className?: string;
  defaultExpanded?: boolean;
  variant?: "compact" | "full";
}

export function PlaygroundTips({
  className,
  defaultExpanded = false,
  variant = "full",
}: PlaygroundTipsProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (variant === "compact") {
    return (
      <div className={cn("space-y-2", className)}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Lightbulb className="h-3.5 w-3.5 text-yellow-500" />
          <span className="font-medium">Playground v2.5 Tips</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </button>

        {isExpanded && (
          <div className="pl-5 space-y-2 text-xs text-muted-foreground">
            {playgroundTips.general.slice(0, 3).map((tip, i) => (
              <p key={i}>• {tip}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-yellow-500/20 bg-yellow-500/5 overflow-hidden",
        className
      )}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-yellow-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-yellow-500/20 flex items-center justify-center">
            <Lightbulb className="h-4 w-4 text-yellow-500" />
          </div>
          <span className="text-sm font-medium">Playground v2.5 Prompting Tips</span>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="p-4 pt-0 space-y-4">
            {/* General Tips */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Zap className="h-3.5 w-3.5 text-primary" />
                Quick Tips
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {playgroundTips.general.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            {/* Texture & Optics */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Focus className="h-3.5 w-3.5 text-emerald-500" />
                Hyper-Realistic Texture
              </div>
              <div className="flex flex-wrap gap-1">
                {playgroundTips.texture.map((keyword) => (
                  <span
                    key={keyword}
                    className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>

            {/* Lighting Categories */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Camera className="h-3.5 w-3.5 text-cyan-500" />
                Lighting & Atmosphere
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-orange-500">Cinematic</span>
                  <div className="flex flex-wrap gap-1">
                    {playgroundTips.lighting.cinematic.map((keyword) => (
                      <span
                        key={keyword}
                        className="px-1.5 py-0.5 text-[10px] rounded bg-orange-500/10 text-orange-600 dark:text-orange-400"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-blue-500">Studio</span>
                  <div className="flex flex-wrap gap-1">
                    {playgroundTips.lighting.studio.map((keyword) => (
                      <span
                        key={keyword}
                        className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-pink-500">Futuristic</span>
                  <div className="flex flex-wrap gap-1">
                    {playgroundTips.lighting.futuristic.map((keyword) => (
                      <span
                        key={keyword}
                        className="px-1.5 py-0.5 text-[10px] rounded bg-pink-500/10 text-pink-600 dark:text-pink-400"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Composition & Action */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Palette className="h-3.5 w-3.5 text-amber-500" />
                  Composition
                </div>
                <div className="flex flex-wrap gap-1">
                  {playgroundTips.composition.general.map((keyword) => (
                    <span
                      key={keyword}
                      className="px-2 py-0.5 text-[10px] rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Trophy className="h-3.5 w-3.5 text-yellow-500" />
                  Action Shots
                </div>
                <div className="flex flex-wrap gap-1">
                  {playgroundTips.composition.action.map((keyword) => (
                    <span
                      key={keyword}
                      className="px-2 py-0.5 text-[10px] rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Background Tips */}
            <div className="p-2 rounded-md bg-slate-500/10 border border-slate-500/20">
              <span className="text-[10px] font-medium text-slate-400">Background Tips: </span>
              <span className="text-[10px] text-muted-foreground">
                {playgroundTips.composition.background.join(" • ")} (v2.5 handles solid backgrounds better than SDXL)
              </span>
            </div>

            {/* Theme Combos */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Theme Combos That Work Well
              </div>
              <div className="grid grid-cols-2 gap-2">
                {playgroundTips.themeCombos.map((combo, i) => (
                  <div
                    key={i}
                    className="p-2 rounded-md bg-muted/50 border border-border/50"
                  >
                    <div className="flex flex-wrap gap-1 mb-1">
                      {combo.themes.map((theme) => (
                        <span
                          key={theme}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-primary/10 text-primary"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      → {combo.result}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Negative Prompts */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Film className="h-3.5 w-3.5 text-red-500" />
                Avoid (Add to Negative Prompt)
              </div>
              <div className="flex flex-wrap gap-1">
                {playgroundTips.negativePrompts.slice(0, 8).map((keyword) => (
                  <span
                    key={keyword}
                    className="px-2 py-0.5 text-[10px] rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 line-through"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline tip display for quick reference
interface InlineTipProps {
  tip: string;
  className?: string;
}

export function InlineTip({ tip, className }: InlineTipProps) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <span className="text-blue-400 font-medium">Tip:</span> {tip}
    </p>
  );
}
