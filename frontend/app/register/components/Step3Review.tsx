"use client";

import { ArrowLeft, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, getPriceTier, formatUSD } from "@/lib/utils";
import { FluxGenerationImage, ArtStyle } from "@/services/api";
import { Step2CreateArtwork } from "./Step2CreateArtwork";
import { SearchResult } from "./Step1DomainSelect";

interface Step3ReviewProps {
  searchResult: SearchResult;
  currencySymbol: string;

  // Step2 props (passed through)
  customPrompt: string;
  onPromptChange: (prompt: string) => void;
  fluxThemes: {
    business: any[];
    exotic: any[];
    jobs: any[];
    fantasy: any[];
    fractal: any[];
    nature: any[];
    space: any[];
    anime: any[];
  };
  selectedTheme: string | null;
  onThemeSelect: (themeId: string) => void;
  onRandomTheme: () => void;
  selectedStyle: "playground" | "animagine";
  onStyleChange: (style: "playground" | "animagine") => void;

  // Art style props
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

  fluxImages: FluxGenerationImage[];
  selectedImageIndex: number | null;
  onImageSelect: (index: number) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  previewCredits: number;
  onPurchaseCredits: () => void;
  isPurchasingCredits: boolean;
  gpusAvailable: number;
  isConnected: boolean;
  error?: string;

  // Actions
  onBack: () => void;
  onPurchase: () => void;
  onConnect: () => void;

  className?: string;
}

export function Step3Review({
  searchResult,
  currencySymbol,
  customPrompt,
  onPromptChange,
  fluxThemes,
  selectedTheme,
  onThemeSelect,
  onRandomTheme,
  selectedStyle,
  onStyleChange,
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
  onBack,
  onPurchase,
  onConnect,
  className,
}: Step3ReviewProps) {
  const hasSelectedImage = selectedImageIndex !== null;
  const successfulImages = fluxImages.filter((img) => img.success);

  // Determine helpful guidance text
  const getGuidanceText = () => {
    if (!selectedTheme) {
      return "Select a theme from the grid above, then generate.";
    }
    if (fluxImages.length === 0) {
      return "Click 'Generate' to create your NFT artwork.";
    }
    if (!hasSelectedImage && successfulImages.length > 0) {
      return "Click the generated image to select it for your NFT.";
    }
    if (hasSelectedImage) {
      return "Great choice! Click 'Purchase' to mint your NFT with this image.";
    }
    return "";
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Design Your NFT</CardTitle>
        <CardDescription>
          Describe what you want to see, then choose a visual style
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Domain Info */}
        <div className="p-4 rounded-lg bg-secondary/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-mono font-bold">
              {searchResult.fqdn}
            </span>
            <Badge className={getPriceTier(searchResult.subdomain).color}>
              {searchResult.tier}
            </Badge>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Price: {formatUSD(searchResult.priceUSD || 0)}</span>
            <span>
              {searchResult.priceFLR?.toFixed(0)} {currencySymbol}
            </span>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-1">
            Plus network gas fees (~0.01-0.05 {currencySymbol})
          </p>
        </div>

        {/* Step2 Artwork Creation with Accordion Layout */}
        <Step2CreateArtwork
          subdomain={searchResult.subdomain}
          tld={searchResult.tld}
          customPrompt={customPrompt}
          onPromptChange={onPromptChange}
          fluxThemes={fluxThemes}
          selectedTheme={selectedTheme}
          onThemeSelect={onThemeSelect}
          onRandomTheme={onRandomTheme}
          selectedStyle={selectedStyle}
          onStyleChange={onStyleChange}
          artStyles={artStyles}
          selectedArtStyleId={selectedArtStyleId}
          onArtStyleChange={onArtStyleChange}
          isLoadingArtStyles={isLoadingArtStyles}
          fluxImages={fluxImages}
          selectedImageIndex={selectedImageIndex}
          onImageSelect={onImageSelect}
          isGenerating={isGenerating}
          onGenerate={onGenerate}
          previewCredits={previewCredits}
          onPurchaseCredits={onPurchaseCredits}
          isPurchasingCredits={isPurchasingCredits}
          gpusAvailable={gpusAvailable}
          isConnected={isConnected}
          error={error}
        />

        {/* Purchase Actions */}
        <div className="relative mt-4">
          {/* Animated background glow when ready to purchase */}
          {hasSelectedImage && isConnected && (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.15),transparent_70%)] rounded-xl animate-pulse" />
          )}

          <div className="relative flex gap-3 p-4 rounded-xl border border-border/50 bg-gradient-to-br from-background via-background to-muted/20">
            {/* Back Button */}
            <Button
              variant="ghost"
              onClick={onBack}
              className="flex-1 h-12 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-300"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            {isConnected ? (
              <Button
                onClick={onPurchase}
                className="flex-1 h-12 font-semibold transition-all duration-300 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-500/30"
              >
                <Sparkles
                  className={cn(
                    "h-4 w-4 mr-2",
                    hasSelectedImage && "animate-pulse"
                  )}
                />
                {`Purchase for ${searchResult.priceFLR?.toFixed(0)} ${currencySymbol}`}
              </Button>
            ) : (
              <Button
                onClick={onConnect}
                className="flex-1 h-12 font-semibold bg-gradient-to-r from-primary to-amber-600 hover:from-primary/90 hover:to-amber-700 text-white shadow-lg shadow-primary/30 transition-all duration-300"
              >
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            )}
          </div>
        </div>

        {/* Guidance text */}
        <p className="text-xs text-muted-foreground text-center">
          {getGuidanceText()}
        </p>
      </CardContent>
    </Card>
  );
}
