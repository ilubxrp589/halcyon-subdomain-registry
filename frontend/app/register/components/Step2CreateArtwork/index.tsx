"use client";

import { useState, useEffect, useRef, ReactNode } from "react";
import { Sparkles, Palette, Image, Loader2, Coins, Paintbrush } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FluxTheme, FluxGenerationImage, ImageStyle, ImageStyleOption, IMAGE_STYLES, ArtStyle } from "@/services/api";
import { AccordionSection } from "../common/Accordion";
import { PromptSection } from "./PromptSection";
import { ThemeSelector } from "./ThemeSelector";
import { StyleSelector } from "./StyleSelector";
import { ImageGallery, ExpandedImageModal } from "./ImageGallery";

interface Step2CreateArtworkProps {
  // Domain info
  subdomain: string;
  tld: string;

  // Prompt state
  customPrompt: string;
  onPromptChange: (prompt: string) => void;

  // Theme state (single selection)
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

  // Style state (model style: playground/animagine)
  selectedStyle: ImageStyle;
  onStyleChange: (style: ImageStyle) => void;
  availableStyles?: ImageStyleOption[];

  // Art Style state (visual rendering style: watercolor, cinematic, etc.)
  artStyles?: {
    artistic: ArtStyle[];
    digital: ArtStyle[];
    film: ArtStyle[];
    movements: ArtStyle[];
    rendering: ArtStyle[];
    mood: ArtStyle[];
  } | null;
  selectedArtStyleId: string | null;
  onArtStyleChange: (styleId: string | null) => void;
  isLoadingArtStyles?: boolean;

  // Generation state
  fluxImages: FluxGenerationImage[];
  selectedImageIndex: number | null;
  onImageSelect: (index: number) => void;
  isGenerating: boolean;
  onGenerate: () => void;

  // Credits state
  previewCredits: number;
  onPurchaseCredits: () => void;
  isPurchasingCredits: boolean;

  // GPU status
  gpusAvailable: number;

  // Connection state
  isConnected: boolean;

  // Error state
  error?: string;

  className?: string;
}

export function Step2CreateArtwork({
  subdomain,
  tld,
  customPrompt,
  onPromptChange,
  fluxThemes,
  selectedTheme,
  onThemeSelect,
  onRandomTheme,
  selectedStyle,
  onStyleChange,
  availableStyles = IMAGE_STYLES,
  artStyles,
  selectedArtStyleId,
  onArtStyleChange,
  isLoadingArtStyles = false,
  fluxImages,
  selectedImageIndex,
  onImageSelect,
  isGenerating,
  onGenerate,
  previewCredits,
  onPurchaseCredits,
  isPurchasingCredits,
  gpusAvailable,
  isConnected,
  error,
  className,
}: Step2CreateArtworkProps) {
  const [expandedImage, setExpandedImage] = useState<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const prevSuccessCountRef = useRef(0);

  const successfulImages = fluxImages.filter(img => img.success);

  // When new successful images arrive, update preview to show the newest batch
  useEffect(() => {
    const currentCount = successfulImages.length;
    const prevCount = prevSuccessCountRef.current;

    if (currentCount > prevCount && currentCount > 0) {
      // New images arrived - show the first of the new batch
      // (index of first new successful image)
      const newImages = successfulImages.slice(prevCount);
      if (newImages.length > 0) {
        const firstNewIndex = fluxImages.indexOf(newImages[0]);
        setPreviewIndex(firstNewIndex);
      }
    } else if (currentCount > 0 && previewIndex === null) {
      // First load with existing images - show the last one
      setPreviewIndex(fluxImages.indexOf(successfulImages[currentCount - 1]));
    }

    prevSuccessCountRef.current = currentCount;
  }, [successfulImages.length, fluxImages]);

  // Determine which sections should be open by default
  const hasImages = fluxImages.length > 0 && fluxImages.some(img => img.success);
  const hasSelectedTheme = selectedTheme !== null;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Expanded Image Modal */}
      <ExpandedImageModal
        images={fluxImages}
        expandedIndex={expandedImage}
        selectedIndex={selectedImageIndex}
        onClose={() => setExpandedImage(null)}
        onSelect={(idx) => {
          onImageSelect(idx);
          setExpandedImage(null);
        }}
        onNavigate={setExpandedImage}
      />

      {/* Section 1: Describe Your Vision */}
      <AccordionSection
        title="Describe Your Vision"
        subtitle="Add a custom prompt or leave empty to auto-generate"
        icon={<Sparkles className="h-4 w-4" />}
        defaultOpen={!hasImages}
      >
        <PromptSection
          subdomain={subdomain}
          tld={tld}
          customPrompt={customPrompt}
          onPromptChange={onPromptChange}
        />
      </AccordionSection>

      {/* Section 2: Style & Theme */}
      <AccordionSection
        title="Style & Theme"
        subtitle={hasSelectedTheme ? "Theme selected" : "Select a theme"}
        icon={<Palette className="h-4 w-4" />}
        badge={
          <Badge
            variant={hasSelectedTheme ? "default" : "secondary"}
            className={cn(
              "text-xs",
              hasSelectedTheme && "bg-green-500"
            )}
          >
            {hasSelectedTheme ? "1" : "0"}/1
          </Badge>
        }
        defaultOpen={!hasImages && !hasSelectedTheme}
      >
        <div className="space-y-4">
          <ThemeSelector
            fluxThemes={fluxThemes}
            selectedTheme={selectedTheme}
            onThemeSelect={onThemeSelect}
            onRandomTheme={onRandomTheme}
            selectedStyle={selectedStyle}
            onStyleChange={onStyleChange}
            availableStyles={availableStyles}
            gpusAvailable={gpusAvailable}
          />

          {/* Art Style Selector */}
          <StyleSelector
            artStyles={artStyles ?? null}
            selectedStyleId={selectedArtStyleId}
            onStyleSelect={onArtStyleChange}
            isLoading={isLoadingArtStyles}
          />

          {/* Credits and Generate Section */}
          <CreditsAndGenerateSection
            previewCredits={previewCredits}
            selectedTheme={selectedTheme}
            isGenerating={isGenerating}
            isConnected={isConnected}
            isPurchasingCredits={isPurchasingCredits}
            onGenerate={onGenerate}
            onPurchaseCredits={onPurchaseCredits}
          />
        </div>
      </AccordionSection>

      {/* Section 3: Generated Images */}
      <AccordionSection
        title="Generated Images"
        subtitle={hasImages ? `${fluxImages.filter(img => img.success).length} images ready` : "Generate images to see them here"}
        icon={<Image className="h-4 w-4" />}
        badge={
          hasImages ? (
            <Badge variant="outline" className="text-xs border-green-500/50 text-green-500">
              {fluxImages.filter(img => img.success).length} ready
            </Badge>
          ) : undefined
        }
        defaultOpen={hasImages}
      >
        {isGenerating ? (
          <GeneratingProgress selectedTheme={selectedTheme} fluxThemes={fluxThemes} />
        ) : hasImages ? (
          <ImageGallery
            images={fluxImages}
            selectedIndex={selectedImageIndex}
            onSelect={onImageSelect}
            onExpand={setExpandedImage}
            previewIndex={previewIndex}
            onPreviewChange={setPreviewIndex}
          />
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Image className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No images generated yet</p>
            <p className="text-xs mt-1">Select a theme and click Generate to create your NFT artwork</p>
          </div>
        )}
      </AccordionSection>

      {/* Error Display */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

// Credits and Generate section
interface CreditsAndGenerateSectionProps {
  previewCredits: number;
  selectedTheme: string | null;
  isGenerating: boolean;
  isConnected: boolean;
  isPurchasingCredits: boolean;
  onGenerate: () => void;
  onPurchaseCredits: () => void;
}

function CreditsAndGenerateSection({
  previewCredits,
  selectedTheme,
  isGenerating,
  isConnected,
  isPurchasingCredits,
  onGenerate,
  onPurchaseCredits,
}: CreditsAndGenerateSectionProps) {
  return (
    <div className="flex items-stretch gap-4 p-4 rounded-lg bg-muted/30 border">
      {/* Credits indicator */}
      <div className={cn(
        "relative overflow-hidden rounded-xl p-3 border flex-1",
        previewCredits === 0
          ? "bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/30"
          : previewCredits <= 3
            ? "bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border-amber-500/30"
            : "bg-gradient-to-r from-emerald-500/10 to-green-500/10 border-emerald-500/30"
      )}>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              previewCredits === 0
                ? "bg-red-500/20 text-red-500"
                : previewCredits <= 3
                  ? "bg-amber-500/20 text-amber-500"
                  : "bg-emerald-500/20 text-emerald-500"
            )}>
              <Sparkles className={cn(
                "h-5 w-5",
                previewCredits > 0 && "animate-pulse"
              )} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Credits</p>
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  "text-2xl font-bold",
                  previewCredits === 0 ? "text-red-500" :
                  previewCredits <= 3 ? "text-amber-500" : "text-emerald-500"
                )}>
                  {previewCredits}
                </span>
                <span className="text-sm text-muted-foreground">remaining</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative mt-3 h-1.5 bg-black/20 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              previewCredits === 0
                ? "bg-red-500"
                : previewCredits <= 3
                  ? "bg-gradient-to-r from-amber-500 to-yellow-500"
                  : "bg-gradient-to-r from-emerald-500 to-green-400"
            )}
            style={{ width: `${Math.min((previewCredits / 10) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Generate or Buy Button */}
      <div className="flex flex-col justify-center min-w-[180px]">
        {previewCredits > 0 ? (
          <Button
            onClick={onGenerate}
            disabled={!selectedTheme || isGenerating || !isConnected}
            className="h-full min-h-[60px]"
            size="lg"
          >
            {isGenerating ? (
              <span className="flex items-center">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </span>
            ) : (
              <span className="flex flex-col items-center gap-1">
                <span className="flex items-center">
                  <Sparkles className="h-4 w-4 mr-2" />
                  {selectedTheme ? "Generate (1 credit)" : "Select theme"}
                </span>
                <span className="text-xs opacity-70">
                  1 image per generation
                </span>
              </span>
            )}
          </Button>
        ) : (
          <Button
            onClick={onPurchaseCredits}
            disabled={isPurchasingCredits || !isConnected}
            className="h-full min-h-[60px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            size="lg"
          >
            {isPurchasingCredits ? (
              <span className="flex items-center">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </span>
            ) : (
              <span className="flex flex-col items-center gap-1">
                <span className="flex items-center">
                  <Coins className="h-4 w-4 mr-2" />
                  Buy Credits
                </span>
                <span className="text-xs opacity-70">
                  10 credits
                </span>
              </span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

// Generation progress indicator
interface GeneratingProgressProps {
  selectedTheme: string | null;
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
}

function GeneratingProgress({ selectedTheme, fluxThemes }: GeneratingProgressProps) {
  const getThemeName = (themeId: string): string => {
    for (const category of Object.values(fluxThemes)) {
      const found = category.find(t => t.id === themeId);
      if (found) return found.name;
    }
    return themeId;
  };

  const getThemeCategory = (themeId: string): string => {
    for (const [cat, themes] of Object.entries(fluxThemes)) {
      if (themes.find(t => t.id === themeId)) return cat;
    }
    return "business";
  };

  const category = selectedTheme ? getThemeCategory(selectedTheme) : "business";

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-amber-500/5 to-green-500/5">
      <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(245,158,11,0.1)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_3s_linear_infinite]" />

      <div className="relative p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 animate-ping" />
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Generating Your NFT Art</h3>
              <p className="text-xs text-muted-foreground">Creating your unique image</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary tabular-nums">~8s</div>
            <div className="text-xs text-muted-foreground">estimated</div>
          </div>
        </div>

        {/* Theme Display */}
        {selectedTheme && (
          <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500">
              <div className="h-full w-full bg-gradient-to-r from-white/0 via-white/50 to-white/0 animate-[shimmer_1.5s_linear_infinite]" />
            </div>

            <div className="flex items-center gap-3">
              <div className={cn(
                "w-3 h-3 rounded-full animate-pulse",
                category === "exotic" ? "bg-amber-500" :
                category === "jobs" ? "bg-cyan-500" :
                category === "fantasy" ? "bg-rose-500" :
                category === "fractal" ? "bg-amber-500" :
                category === "nature" ? "bg-teal-500" :
                category === "space" ? "bg-amber-500" :
                category === "anime" ? "bg-pink-500" : "bg-green-500"
              )} />
              <span className="text-sm font-medium">{getThemeName(selectedTheme)}</span>
              <span className="text-xs text-muted-foreground ml-auto capitalize">{category}</span>
            </div>
          </div>
        )}

        {/* Main Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Processing...</span>
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Rendering image
            </span>
          </div>
          <div className="h-2 bg-black/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-amber-500 to-green-500 rounded-full"
              style={{
                animation: "progressGrow 15s ease-out forwards",
              }}
            />
          </div>
        </div>

        <div className="text-center text-xs text-muted-foreground/70 italic">
          1024x1024 image with custom Halcyon branding
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes progressGrow {
          0% { width: 3%; }
          30% { width: 25%; }
          60% { width: 60%; }
          80% { width: 85%; }
          95% { width: 95%; }
          100% { width: 98%; }
        }
      `}</style>
    </div>
  );
}

// Re-export subcomponents
export { PromptSection } from "./PromptSection";
export { ThemeSelector } from "./ThemeSelector";
export { StyleSelector } from "./StyleSelector";
export { ImageGallery, ExpandedImageModal } from "./ImageGallery";
export { PlaygroundTips, InlineTip } from "./PlaygroundTips";
