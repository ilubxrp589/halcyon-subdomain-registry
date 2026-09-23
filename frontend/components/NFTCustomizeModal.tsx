"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, Check, Palette, Sparkles, Coins, ChevronLeft, ArrowRight, ChevronLeftIcon, ChevronRightIcon, Droplets, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Domain,
  UnifiedCreditsInfo,
  getFluxThemes,
  getArtStyles,
  generateForDomain,
  getFluxGenerationStatus,
  finalizeNFT,
  FluxTheme,
  FluxGenerationImage,
  ArtStyle,
  previewWatermark,
  finalizeWithWatermark,
  getWatermarkStyles,
  WatermarkStyle,
} from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { WatermarkSelector } from "@/app/register/components/Step2CreateArtwork/WatermarkSelector";

type ModalStep = "configure" | "generating" | "select" | "finalizing" | "success";

// Storage key for persisting state
const getStorageKey = (fqdn: string) => `nft-customize-${fqdn}`;

// Lightweight state for localStorage (no images - they're fetched from backend)
interface PersistedState {
  step: ModalStep;
  generationIds: string[]; // Track all generation IDs for fetching
  selectedImageIndex: number | null;
  imageCount: number; // Track how many images we had
  model: "playground" | "animagine";
  artStyleId: string | null;
  selectedThemes: string[];
  prompt: string;
  timestamp: number;
}

// Persist state to localStorage (without images)
function saveState(fqdn: string, state: Partial<PersistedState>) {
  try {
    const key = getStorageKey(fqdn);
    const existing = localStorage.getItem(key);
    const parsed = existing ? JSON.parse(existing) : {};
    const toSave = { ...parsed, ...state, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(toSave));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

// Load state from localStorage (expires after 1 hour)
function loadState(fqdn: string): PersistedState | null {
  try {
    const key = getStorageKey(fqdn);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as PersistedState;
    // Expire after 1 hour
    if (Date.now() - parsed.timestamp > 60 * 60 * 1000) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

// Clear persisted state
function clearState(fqdn: string) {
  try {
    localStorage.removeItem(getStorageKey(fqdn));
  } catch (e) {
    console.error("Failed to clear state:", e);
  }
}

interface NFTCustomizeModalProps {
  domain: Domain;
  credits: UnifiedCreditsInfo | null;
  onClose: () => void;
  onSuccess: () => void;
  onCreditsChange?: () => void;
}

export function NFTCustomizeModal({
  domain,
  credits,
  onClose,
  onSuccess,
  onCreditsChange,
}: NFTCustomizeModalProps) {
  const { getAuthCredentials } = useAuth();

  // Modal state
  const [step, setStep] = useState<ModalStep>("configure");
  const [error, setError] = useState<string | null>(null);

  // Configuration state
  const [model, setModel] = useState<"playground" | "animagine">("playground");
  const [artStyleId, setArtStyleId] = useState<string | null>(null);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [themeSearch, setThemeSearch] = useState("");

  // Data state
  const [fluxThemes, setFluxThemes] = useState<Record<string, FluxTheme[]>>({});
  const [artStyles, setArtStyles] = useState<Record<string, ArtStyle[]> | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Generation state
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<FluxGenerationImage[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  // Result state
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);

  // Watermark state
  const [watermarkStyle, setWatermarkStyle] = useState<string>("cinematic");
  const [previewedImage, setPreviewedImage] = useState<string | null>(null);
  const [isPreviewingWatermark, setIsPreviewingWatermark] = useState(false);
  // Cache watermarked versions for each image by index
  const [watermarkedCache, setWatermarkedCache] = useState<Record<number, string>>({});
  // All watermark styles for cycling
  const [watermarkStyles, setWatermarkStyles] = useState<WatermarkStyle[]>([]);
  const [watermarkStyleIndex, setWatermarkStyleIndex] = useState(0);

  // Expanded preview state
  const [isExpanded, setIsExpanded] = useState(false);

  // Ref for thumbnail scroll
  const thumbnailRef = useRef<HTMLDivElement>(null);

  // Get current preview index (selected or first)
  const currentPreviewIndex = selectedImageIndex ?? 0;

  // Apply watermark to a specific image and cache it
  const applyWatermarkToImage = useCallback(async (imageIndex: number, style: string): Promise<string | null> => {
    const image = generatedImages[imageIndex];
    if (!image?.imageBase64) return null;

    try {
      const result = await previewWatermark(
        image.imageBase64,
        domain.fqdn,
        style
      );
      if (result.success && result.imageBase64) {
        return result.imageBase64;
      }
    } catch (err) {
      console.error("Failed to apply watermark:", err);
    }
    return null;
  }, [generatedImages, domain.fqdn]);

  // Navigate to previous/next image
  const navigatePrev = useCallback(async () => {
    if (generatedImages.length === 0) return;
    const newIndex = currentPreviewIndex > 0 ? currentPreviewIndex - 1 : generatedImages.length - 1;
    setSelectedImageIndex(newIndex);

    // Always apply watermark if one was already selected (previewedImage exists or in expanded view)
    if ((previewedImage || isExpanded) && watermarkStyle) {
      // Check cache first
      if (watermarkedCache[newIndex]) {
        setPreviewedImage(watermarkedCache[newIndex]);
      } else {
        // Generate watermark for new image
        setPreviewedImage(null);
        setIsPreviewingWatermark(true);
        const watermarked = await applyWatermarkToImage(newIndex, watermarkStyle);
        if (watermarked) {
          setPreviewedImage(watermarked);
          setWatermarkedCache(prev => ({ ...prev, [newIndex]: watermarked }));
        }
        setIsPreviewingWatermark(false);
      }
    } else {
      setPreviewedImage(null);
    }
  }, [currentPreviewIndex, generatedImages.length, isExpanded, watermarkStyle, watermarkedCache, applyWatermarkToImage, previewedImage]);

  const navigateNext = useCallback(async () => {
    if (generatedImages.length === 0) return;
    const newIndex = currentPreviewIndex < generatedImages.length - 1 ? currentPreviewIndex + 1 : 0;
    setSelectedImageIndex(newIndex);

    // Always apply watermark if one was already selected (previewedImage exists or in expanded view)
    if ((previewedImage || isExpanded) && watermarkStyle) {
      // Check cache first
      if (watermarkedCache[newIndex]) {
        setPreviewedImage(watermarkedCache[newIndex]);
      } else {
        // Generate watermark for new image
        setPreviewedImage(null);
        setIsPreviewingWatermark(true);
        const watermarked = await applyWatermarkToImage(newIndex, watermarkStyle);
        if (watermarked) {
          setPreviewedImage(watermarked);
          setWatermarkedCache(prev => ({ ...prev, [newIndex]: watermarked }));
        }
        setIsPreviewingWatermark(false);
      }
    } else {
      setPreviewedImage(null);
    }
  }, [currentPreviewIndex, generatedImages.length, isExpanded, watermarkStyle, watermarkedCache, applyWatermarkToImage, previewedImage]);

  // Keyboard navigation
  useEffect(() => {
    if (step !== "select") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigatePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateNext();
      } else if (e.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, navigatePrev, navigateNext, isExpanded]);

  // Apply watermark when entering expanded view (if not already cached)
  useEffect(() => {
    if (!isExpanded || !watermarkStyle) return;

    const applyWatermarkForExpanded = async () => {
      // If we already have a cached version for the current image, use it
      if (watermarkedCache[currentPreviewIndex]) {
        setPreviewedImage(watermarkedCache[currentPreviewIndex]);
        return;
      }

      // If we have a previewed image for the selected index, cache it
      if (previewedImage && selectedImageIndex === currentPreviewIndex) {
        setWatermarkedCache(prev => ({ ...prev, [currentPreviewIndex]: previewedImage }));
        return;
      }

      // Otherwise, generate the watermark
      setIsPreviewingWatermark(true);
      const watermarked = await applyWatermarkToImage(currentPreviewIndex, watermarkStyle);
      if (watermarked) {
        setPreviewedImage(watermarked);
        setWatermarkedCache(prev => ({ ...prev, [currentPreviewIndex]: watermarked }));
      }
      setIsPreviewingWatermark(false);
    };

    applyWatermarkForExpanded();
  }, [isExpanded, currentPreviewIndex, watermarkStyle, watermarkedCache, previewedImage, selectedImageIndex, applyWatermarkToImage]);

  // Track all generation IDs for persistence
  const [allGenerationIds, setAllGenerationIds] = useState<string[]>([]);

  // Restore state from localStorage on mount
  useEffect(() => {
    const restoreState = async () => {
      const saved = loadState(domain.fqdn);
      if (saved && saved.step !== "success" && saved.step !== "finalizing") {
        // Restore configuration
        if (saved.model) setModel(saved.model);
        if (saved.artStyleId) setArtStyleId(saved.artStyleId);
        if (saved.selectedThemes?.length) setSelectedThemes(saved.selectedThemes);
        if (saved.prompt) setPrompt(saved.prompt);

        // Restore generation results by fetching from backend
        if (saved.generationIds?.length > 0 && saved.imageCount > 0) {
          try {
            const allImages: FluxGenerationImage[] = [];
            for (const genId of saved.generationIds) {
              const result = await getFluxGenerationStatus(genId);
              if (result.success && result.images) {
                const taggedImages = result.images.map(img => ({
                  ...img,
                  generationId: genId,
                }));
                allImages.push(...taggedImages);
              }
            }
            if (allImages.length > 0) {
              setGeneratedImages(allImages);
              setGenerationId(saved.generationIds[saved.generationIds.length - 1]);
              setAllGenerationIds(saved.generationIds);
              setSelectedImageIndex(saved.selectedImageIndex !== null && saved.selectedImageIndex < allImages.length
                ? saved.selectedImageIndex
                : 0);
              setStep("select");
            }
          } catch (e) {
            console.error("Failed to restore images:", e);
          }
        }
      }
    };
    restoreState();
  }, [domain.fqdn]);

  // Update allGenerationIds when generationId changes
  useEffect(() => {
    if (generationId && !allGenerationIds.includes(generationId)) {
      setAllGenerationIds(prev => [...prev, generationId]);
    }
  }, [generationId, allGenerationIds]);

  // Persist state changes (without images)
  useEffect(() => {
    if (step === "success") {
      // Clear state on success
      clearState(domain.fqdn);
    } else if (step === "select" && generatedImages.length > 0) {
      // Save without images - just track generation IDs
      saveState(domain.fqdn, {
        step,
        generationIds: allGenerationIds,
        selectedImageIndex,
        imageCount: generatedImages.length,
        model,
        artStyleId,
        selectedThemes,
        prompt,
      });
    } else if (step === "configure") {
      // Save configuration state
      saveState(domain.fqdn, {
        step,
        model,
        artStyleId,
        selectedThemes,
        prompt,
        generationIds: allGenerationIds,
        selectedImageIndex: null,
        imageCount: generatedImages.length,
      });
    }
  }, [step, allGenerationIds, generatedImages.length, selectedImageIndex, model, artStyleId, selectedThemes, prompt, domain.fqdn]);

  // Load themes and styles on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingData(true);
      try {
        const [themesResult, stylesResult, watermarkResult] = await Promise.all([
          getFluxThemes(),
          getArtStyles(),
          getWatermarkStyles(),
        ]);
        if (themesResult.success) {
          setFluxThemes(themesResult.themes);
        }
        if (stylesResult.success) {
          setArtStyles(stylesResult.styles);
        }
        if (watermarkResult.success) {
          setWatermarkStyles(watermarkResult.styles);
          // Find index of default/current style
          const idx = watermarkResult.styles.findIndex(s => s.id === watermarkStyle);
          if (idx >= 0) setWatermarkStyleIndex(idx);
        }
      } catch (e) {
        console.error("Failed to load themes/styles:", e);
        setError("Failed to load customization options");
      } finally {
        setIsLoadingData(false);
      }
    };
    loadData();
  }, []);

  // Theme category order and labels
  const themeCategories = [
    { key: "business", label: "Business" },
    { key: "jobs", label: "Jobs" },
    { key: "nature", label: "Nature" },
    { key: "space", label: "Space" },
    { key: "fantasy", label: "Fantasy" },
    { key: "exotic", label: "Exotic" },
    { key: "fractal", label: "Fractal" },
    { key: "anime", label: "Anime" },
  ] as const;

  // Active theme category filter (null = all)
  const [activeThemeCategory, setActiveThemeCategory] = useState<string | null>(null);

  // Get all themes (available for both models)
  const getAllThemes = useCallback((): FluxTheme[] => {
    return [
      ...(fluxThemes.business || []),
      ...(fluxThemes.jobs || []),
      ...(fluxThemes.nature || []),
      ...(fluxThemes.space || []),
      ...(fluxThemes.fantasy || []),
      ...(fluxThemes.exotic || []),
      ...(fluxThemes.fractal || []),
      ...(fluxThemes.anime || []),
    ];
  }, [fluxThemes]);

  // Get filtered themes based on active category and search
  const getFilteredThemes = useCallback((): FluxTheme[] => {
    let themes: FluxTheme[];
    if (activeThemeCategory) {
      themes = fluxThemes[activeThemeCategory] || [];
    } else {
      themes = getAllThemes();
    }
    if (themeSearch) {
      themes = themes.filter((t) => t.name.toLowerCase().includes(themeSearch.toLowerCase()));
    }
    return themes;
  }, [fluxThemes, activeThemeCategory, themeSearch, getAllThemes]);

  // Select theme (single selection)
  const selectTheme = (themeId: string) => {
    setSelectedThemes(prev => {
      // Toggle off if already selected
      if (prev.includes(themeId)) {
        return [];
      }
      // Select single theme
      return [themeId];
    });
  };

  // Random theme selection
  const selectRandomTheme = () => {
    const allThemes = getAllThemes();
    if (allThemes.length === 0) return;
    const randomIndex = Math.floor(Math.random() * allThemes.length);
    setSelectedThemes([allThemes[randomIndex].id]);
  };

  // Check if can generate - need 1 theme selected and 1 credit
  const canGenerate = selectedThemes.length === 1 && (credits?.total ?? 0) >= 1;

  // State for generating more
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);

  // Handle generate (initial or add more)
  const handleGenerate = async (addMore = false) => {
    if (!canGenerate) return;

    const previousStep = step;
    const previousImages = [...generatedImages];

    if (addMore) {
      setIsGeneratingMore(true);
    } else {
      setStep("generating");
    }
    setError(null);

    try {
      const creds = await getAuthCredentials();
      // Use first (and only) selected theme
      const theme = selectedThemes[0];
      let result = await generateForDomain(
        creds,
        domain.fqdn,
        theme,
        {
          customPrompt: prompt.trim() || undefined,
          style: model,
          styleId: artStyleId || undefined,
        }
      );

      if (!result.success) {
        throw new Error(result.error || "Generation failed");
      }

      const newGenerationId = result.generationId || null;
      setGenerationId(newGenerationId);

      // Tag new images with generation ID
      const newImages = (result.images || []).map((img) => ({
        ...img,
        generationId: newGenerationId || undefined,
      }));

      if (previousImages.length > 0) {
        // Always append to existing images
        const taggedPrevious = previousImages.map(img => ({
          ...img,
          generationId: img.generationId || generationId || undefined,
        }));
        setGeneratedImages([...taggedPrevious, ...newImages]);
        // Auto-select first new image
        const newIndex = previousImages.length;
        setSelectedImageIndex(newIndex);
        // Clear watermark preview to show the new raw image
        setPreviewedImage(null);

        // Auto-scroll thumbnail strip to the new images after React renders
        setTimeout(() => {
          if (thumbnailRef.current) {
            const thumbnails = thumbnailRef.current.querySelectorAll('button');
            if (thumbnails[newIndex]) {
              thumbnails[newIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else {
              thumbnailRef.current.scrollTo({ left: thumbnailRef.current.scrollWidth, behavior: 'smooth' });
            }
          }
        }, 300);
      } else {
        // First generation - just set the new images
        setGeneratedImages(newImages);
        // Select first image
        setSelectedImageIndex(0);
        // Clear watermark preview
        setPreviewedImage(null);
      }

      setStep("select");
      // Refresh credits counter after generation
      onCreditsChange?.();
    } catch (e) {
      console.error("Generation error:", e);
      setError(e instanceof Error ? e.message : "Generation failed");
      if (!addMore) {
        setStep("configure");
      }
    } finally {
      setIsGeneratingMore(false);
    }
  };

  // Handle image selection - apply watermark if one was already selected
  const handleSelectImage = async (index: number) => {
    setSelectedImageIndex(index);

    // Use cached watermark if available for this image
    if (watermarkedCache[index]) {
      setPreviewedImage(watermarkedCache[index]);
    } else if (previewedImage && watermarkStyle) {
      // If a watermark was applied to another image, apply it to this one too
      setPreviewedImage(null);
      setIsPreviewingWatermark(true);
      const watermarked = await applyWatermarkToImage(index, watermarkStyle);
      if (watermarked) {
        setPreviewedImage(watermarked);
        setWatermarkedCache(prev => ({ ...prev, [index]: watermarked }));
      }
      setIsPreviewingWatermark(false);
    } else {
      setPreviewedImage(null);
    }
  };

  // Handle watermark style change - preview the new style and clear cache
  const handleWatermarkChange = async (newStyle: string) => {
    if (selectedImageIndex === null) return;
    const selectedImage = generatedImages[selectedImageIndex];
    if (!selectedImage?.imageBase64) return;

    // Update style index
    const idx = watermarkStyles.findIndex(s => s.id === newStyle);
    if (idx >= 0) setWatermarkStyleIndex(idx);

    setWatermarkStyle(newStyle);
    setIsPreviewingWatermark(true);
    // Clear cached watermarks since style changed
    setWatermarkedCache({});

    try {
      const result = await previewWatermark(
        selectedImage.imageBase64, // Original un-watermarked image
        domain.fqdn,
        newStyle
      );
      if (result.success) {
        setPreviewedImage(result.imageBase64);
        // Cache the watermarked version for the selected image
        setWatermarkedCache(prev => ({ ...prev, [selectedImageIndex]: result.imageBase64! }));
      }
    } catch (err) {
      console.error("Failed to preview watermark:", err);
    } finally {
      setIsPreviewingWatermark(false);
    }
  };

  // Cycle to previous watermark style
  const handlePrevWatermark = useCallback(() => {
    if (watermarkStyles.length === 0 || isPreviewingWatermark) return;
    const newIndex = watermarkStyleIndex === 0 ? watermarkStyles.length - 1 : watermarkStyleIndex - 1;
    const newStyle = watermarkStyles[newIndex].id;
    setWatermarkStyleIndex(newIndex);
    handleWatermarkChange(newStyle);
  }, [watermarkStyles, watermarkStyleIndex, isPreviewingWatermark, handleWatermarkChange]);

  // Cycle to next watermark style
  const handleNextWatermark = useCallback(() => {
    if (watermarkStyles.length === 0 || isPreviewingWatermark) return;
    const newIndex = watermarkStyleIndex === watermarkStyles.length - 1 ? 0 : watermarkStyleIndex + 1;
    const newStyle = watermarkStyles[newIndex].id;
    setWatermarkStyleIndex(newIndex);
    handleWatermarkChange(newStyle);
  }, [watermarkStyles, watermarkStyleIndex, isPreviewingWatermark, handleWatermarkChange]);

  // Handle finalize - use the new watermark flow
  const handleFinalize = async () => {
    if (selectedImageIndex === null) return;

    const selectedImage = generatedImages[selectedImageIndex];
    if (!selectedImage || !selectedImage.imageBase64) return;

    if ((credits?.total ?? 0) < 1) {
      setError("Not enough credits for finalization");
      return;
    }

    setStep("finalizing");
    setError(null);

    try {
      const creds = await getAuthCredentials();

      // Use the new finalize-with-watermark endpoint
      const result = await finalizeWithWatermark(
        creds,
        selectedImage.imageBase64, // Original un-watermarked image
        domain.fqdn,
        watermarkStyle,
        {
          name: domain.fqdn,
          description: `${domain.fqdn} - Halcyon Subdomain NFT`,
          theme: selectedImage.theme?.id,
        }
      );

      if (!result.success) {
        throw new Error(result.error || "Finalization failed");
      }

      setResultImageUrl(result.imageUrl || null);
      setStep("success");
    } catch (e) {
      console.error("Finalization error:", e);
      setError(e instanceof Error ? e.message : "Finalization failed");
      setStep("select");
    }
  };

  // Display image: show watermarked preview if available, else original
  const displayImage = previewedImage || (selectedImageIndex !== null ? generatedImages[selectedImageIndex]?.imageBase64 : null);

  // Available credits
  const availableCredits = credits?.total ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b">
        <div className="container max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step !== "configure" && step !== "success" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (step === "select") setStep("configure");
                }}
                disabled={step === "generating" || step === "finalizing"}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                Customize NFT
              </h2>
              <p className="text-sm text-muted-foreground font-mono">
                {domain.fqdn}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <Coins className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{availableCredits}</span>
              <span className="text-xs text-muted-foreground">credits</span>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container max-w-4xl mx-auto px-4 py-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/50 text-destructive">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoadingData && step === "configure" && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading customization options...</p>
          </div>
        )}

        {/* Configure Step */}
        {step === "configure" && !isLoadingData && (
          <div className="space-y-8">
            {/* Model Selection */}
            <div>
              <Label className="text-lg font-semibold mb-3 block">1. Choose Style</Label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setModel("playground")}
                  className={cn(
                    "p-4 rounded-xl border-2 text-left transition-all",
                    model === "playground"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="font-semibold mb-1">Playground</div>
                  <div className="text-sm text-muted-foreground">
                    Photorealistic, detailed artwork
                  </div>
                </button>
                <button
                  onClick={() => setModel("animagine")}
                  className={cn(
                    "p-4 rounded-xl border-2 text-left transition-all",
                    model === "animagine"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="font-semibold mb-1">Animagine</div>
                  <div className="text-sm text-muted-foreground">
                    Anime-style illustrations
                  </div>
                </button>
              </div>
            </div>

            {/* Art Style Selection (Optional) */}
            {artStyles && (
              <div>
                <Label className="text-lg font-semibold mb-3 block">
                  2. Art Style <span className="text-sm font-normal text-muted-foreground">(Optional — {Object.values(artStyles).flat().length} styles)</span>
                </Label>
                <div className="max-h-60 overflow-y-auto p-3 rounded-lg bg-secondary/30 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setArtStyleId(null)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                        artStyleId === null
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary hover:bg-secondary/80"
                      )}
                    >
                      Default
                    </button>
                  </div>
                  {Object.entries(artStyles).map(([category, styles]) => (
                    <div key={category}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                        {category}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {styles.map((style) => (
                          <button
                            key={style.id}
                            onClick={() => setArtStyleId(style.id)}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-sm transition-all",
                              artStyleId === style.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary hover:bg-secondary/80"
                            )}
                          >
                            {style.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Theme Selection */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-lg font-semibold">
                  3. Select Theme
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({selectedThemes.length}/1 — {getAllThemes().length} themes)
                  </span>
                </Label>
                <Button variant="outline" size="sm" onClick={selectRandomTheme}>
                  <Sparkles className="h-4 w-4 mr-1" />
                  Random
                </Button>
              </div>

              {/* Category Tabs */}
              <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
                <button
                  onClick={() => setActiveThemeCategory(null)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                    activeThemeCategory === null
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 hover:bg-secondary text-muted-foreground"
                  )}
                >
                  All ({getAllThemes().length})
                </button>
                {themeCategories.map((cat) => {
                  const count = (fluxThemes[cat.key] || []).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => setActiveThemeCategory(cat.key)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                        activeThemeCategory === cat.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/60 hover:bg-secondary text-muted-foreground"
                      )}
                    >
                      {cat.label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder={`Search ${activeThemeCategory ? themeCategories.find(c => c.key === activeThemeCategory)?.label : 'all'} themes...`}
                value={themeSearch}
                onChange={(e) => setThemeSearch(e.target.value)}
                className="w-full px-3 py-2 mb-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />

              {/* Theme Grid */}
              <div className="relative z-10 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-72 overflow-y-auto p-2 rounded-lg bg-secondary/30">
                {getFilteredThemes().map((theme) => (
                  <button
                    type="button"
                    key={theme.id}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); selectTheme(theme.id); }}
                    className={cn(
                      "p-3 rounded-lg text-sm text-center transition-all border cursor-pointer select-none",
                      selectedThemes.includes(theme.id)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card hover:bg-accent border-transparent"
                    )}
                  >
                    {theme.name}
                  </button>
                ))}
                {getFilteredThemes().length === 0 && (
                  <div className="col-span-full text-center py-6 text-muted-foreground text-sm">
                    No themes match your search
                  </div>
                )}
              </div>

              {/* Selected theme display */}
              {selectedThemes.length > 0 && (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span className="text-sm text-muted-foreground">Selected:</span>
                  {selectedThemes.map((themeId) => {
                    const theme = getAllThemes().find(t => t.id === themeId);
                    return (
                      <span
                        key={themeId}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium"
                      >
                        {theme?.name || themeId}
                        <button
                          onClick={() => selectTheme(themeId)}
                          className="hover:text-primary/70 ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Custom Prompt */}
            <div>
              <Label className="text-lg font-semibold mb-3 block">
                4. Custom Prompt <span className="text-sm font-normal text-muted-foreground">(Optional)</span>
              </Label>
              <Textarea
                placeholder="Describe what you want to see in your NFT artwork..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[80px]"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {prompt.length}/500 characters
              </p>
            </div>

            {/* Generate Button */}
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
              {generatedImages.length > 0 && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setStep("select")}
                  className="px-6"
                >
                  <ChevronLeft className="h-5 w-5 mr-1" />
                  Back to Preview ({generatedImages.length} images)
                </Button>
              )}
              <Button
                size="lg"
                onClick={() => handleGenerate(false)}
                disabled={!canGenerate}
                className="px-8"
              >
                <Sparkles className="h-5 w-5 mr-2" />
                {generatedImages.length > 0 ? "Generate New Image" : "Generate Image"} (1 credit)
              </Button>
            </div>
            {availableCredits < 1 && (
              <p className="text-center text-sm text-destructive">
                Not enough credits. Purchase more domains to earn credits.
              </p>
            )}
          </div>
        )}

        {/* Generating Step */}
        {step === "generating" && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <Sparkles className="absolute inset-0 m-auto h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mt-6 mb-2">Generating Your Artwork</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Creating your unique image based on the selected theme.
              This may take 10-20 seconds...
            </p>
          </div>
        )}

        {/* Select Step */}
        {step === "select" && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-2">Choose Your NFT</h3>
              <p className="text-muted-foreground">
                Select one of the generated images to use as your NFT artwork
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("configure")}
                className="mt-2 text-muted-foreground hover:text-foreground"
              >
                <Palette className="h-4 w-4 mr-1" />
                Change Style / Theme
              </Button>
            </div>

            {/* Hero Preview with Navigation */}
            <div className="flex items-center justify-center gap-4">
              {/* Left Arrow */}
              <Button
                variant="outline"
                size="icon"
                onClick={navigatePrev}
                disabled={generatedImages.length <= 1}
                className="shrink-0 h-12 w-12 rounded-full"
              >
                <ChevronLeftIcon className="h-6 w-6" />
              </Button>

              {/* Hero Image - shows watermarked preview when available */}
              <div
                className="relative w-full max-w-lg aspect-square rounded-2xl overflow-hidden border-4 border-primary shadow-2xl cursor-pointer group"
                onClick={() => setIsExpanded(true)}
              >
                {(() => {
                  const heroImg = generatedImages[currentPreviewIndex];
                  // Show watermarked preview if available for selected image, otherwise show original
                  const imageToShow = (currentPreviewIndex === selectedImageIndex && previewedImage)
                    ? previewedImage
                    : heroImg?.imageBase64;

                  if (heroImg?.success && imageToShow) {
                    return (
                      <>
                        <img
                          src={imageToShow.startsWith('data:') ? imageToShow : `data:image/png;base64,${imageToShow}`}
                          alt="Selected NFT preview"
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        {/* Loading overlay when previewing watermark */}
                        {isPreviewingWatermark && currentPreviewIndex === selectedImageIndex && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-white" />
                          </div>
                        )}

                        {/* WATERMARK CONTROLS - Right side of image */}
                        <div
                          className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="default"
                            size="icon"
                            onClick={handlePrevWatermark}
                            disabled={isPreviewingWatermark || watermarkStyles.length === 0}
                            className="h-12 w-12 rounded-full bg-yellow-600 hover:bg-yellow-500 border-2 border-white shadow-xl"
                          >
                            <ChevronUp className="h-7 w-7 text-white" />
                          </Button>

                          <div className="px-3 py-2 rounded-xl bg-yellow-600/90 border-2 border-white shadow-xl text-center backdrop-blur-sm">
                            <Droplets className="h-5 w-5 text-white mx-auto mb-1" />
                            <p className="text-[10px] text-white/80 font-medium uppercase tracking-wide">Watermark</p>
                            <p className="text-xs text-white font-bold truncate max-w-[80px]">
                              {watermarkStyles[watermarkStyleIndex]?.name || watermarkStyle}
                            </p>
                          </div>

                          <Button
                            variant="default"
                            size="icon"
                            onClick={handleNextWatermark}
                            disabled={isPreviewingWatermark || watermarkStyles.length === 0}
                            className="h-12 w-12 rounded-full bg-yellow-600 hover:bg-yellow-500 border-2 border-white shadow-xl"
                          >
                            <ChevronDown className="h-7 w-7 text-white" />
                          </Button>
                        </div>

                        <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                          <p className="text-white text-lg font-semibold">
                            {heroImg.theme?.name || `Image ${currentPreviewIndex + 1}`}
                          </p>
                          <p className="text-white/70 text-sm">
                            {domain.fqdn} • {currentPreviewIndex + 1} of {generatedImages.length}
                            {previewedImage && currentPreviewIndex === selectedImageIndex && ` • ${watermarkStyle} watermark`}
                          </p>
                        </div>
                        {selectedImageIndex !== null && selectedImageIndex === currentPreviewIndex && (
                          <div className="absolute top-4 left-4 bg-primary text-primary-foreground rounded-full p-2">
                            <Check className="h-6 w-6" />
                          </div>
                        )}
                      </>
                    );
                  }
                  return (
                    <div className="w-full h-full flex items-center justify-center bg-secondary">
                      <span className="text-muted-foreground">No image selected</span>
                    </div>
                  );
                })()}
              </div>

              {/* Right Arrow */}
              <Button
                variant="outline"
                size="icon"
                onClick={navigateNext}
                disabled={generatedImages.length <= 1}
                className="shrink-0 h-12 w-12 rounded-full"
              >
                <ChevronRightIcon className="h-6 w-6" />
              </Button>
            </div>

            {/* Thumbnail Strip */}
            <div className="relative">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    if (thumbnailRef.current) {
                      thumbnailRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                    }
                  }}
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </Button>
                <div
                  ref={thumbnailRef}
                  className="flex gap-3 overflow-x-auto scrollbar-hide py-2 px-1 flex-1"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {generatedImages.map((img, index) => (
                    <button
                      key={index}
                      onClick={() => handleSelectImage(index)}
                      disabled={!img.success}
                      className={cn(
                        "relative shrink-0 w-24 h-24 rounded-lg overflow-hidden border-3 transition-all",
                        selectedImageIndex === index
                          ? "border-primary ring-2 ring-primary/50 scale-105"
                          : "border-border hover:border-primary/50 hover:scale-102",
                        !img.success && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {img.success && img.imageBase64 ? (
                        <img
                          src={img.imageBase64.startsWith('data:') ? img.imageBase64 : `data:image/png;base64,${img.imageBase64}`}
                          alt={`Thumbnail ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-secondary">
                          <X className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      {selectedImageIndex === index && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <Check className="h-6 w-6 text-primary" />
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 p-1 bg-black/60">
                        <p className="text-white text-xs truncate text-center">
                          {img.theme?.name || `#${index + 1}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    if (thumbnailRef.current) {
                      thumbnailRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                    }
                  }}
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Watermark Style Selector */}
            {selectedImageIndex !== null && (
              <div className="relative">
                <WatermarkSelector
                  selectedStyle={watermarkStyle}
                  onStyleChange={handleWatermarkChange}
                  disabled={isPreviewingWatermark || isGeneratingMore}
                />
                {isPreviewingWatermark && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center rounded-xl">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setStep("configure")}
                disabled={isPreviewingWatermark}
                className="px-6"
              >
                <ChevronLeft className="h-5 w-5 mr-2" />
                Select a New Theme
              </Button>
              <Button
                size="lg"
                onClick={handleFinalize}
                disabled={selectedImageIndex === null || availableCredits < 1 || isGeneratingMore || isPreviewingWatermark || !previewedImage}
                className="px-8"
              >
                <ArrowRight className="h-5 w-5 mr-2" />
                {previewedImage ? `Mint with ${watermarkStyle} watermark (1 credit)` : 'Select a watermark style'}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {generatedImages.length} images • Credits: {availableCredits} • Watermark: {watermarkStyle}
            </p>
          </div>
        )}

        {/* Finalizing Step */}
        {step === "finalizing" && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-6" />
            <h3 className="text-xl font-semibold mb-2">Finalizing Your NFT</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Uploading to IPFS and updating your domain&apos;s metadata...
            </p>
          </div>
        )}

        {/* Success Step */}
        {step === "success" && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
              <Check className="h-10 w-10 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold mb-2">NFT Customized!</h3>
            <p className="text-muted-foreground text-center mb-6">
              Your domain <span className="font-mono font-semibold">{domain.fqdn}</span> now has custom artwork.
            </p>

            {/* Show result image */}
            {resultImageUrl && (
              <div className="w-64 h-64 rounded-xl overflow-hidden border-4 border-primary/30 mb-6">
                <img
                  src={resultImageUrl}
                  alt="Your new NFT"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <Button size="lg" onClick={onSuccess}>
              Back to Dashboard
            </Button>
          </div>
        )}
      </div>

      {/* Expanded/Fullscreen Preview Modal */}
      {isExpanded && generatedImages[currentPreviewIndex] && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center"
          onClick={() => setIsExpanded(false)}
        >
          {/* Left Arrow */}
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); navigatePrev(); }}
            disabled={generatedImages.length <= 1 || isPreviewingWatermark}
            className="absolute left-4 h-14 w-14 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <ChevronLeftIcon className="h-8 w-8" />
          </Button>

          {/* Image - show watermarked version */}
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const img = generatedImages[currentPreviewIndex];
              if (!img?.imageBase64) {
                return (
                  <div className="w-[512px] h-[512px] flex items-center justify-center bg-gray-900 rounded-lg">
                    <span className="text-white/50">No image available</span>
                  </div>
                );
              }

              // Priority: cached watermark > current preview (if for this index) > original
              const cachedWatermark = watermarkedCache[currentPreviewIndex];
              const currentPreview = (selectedImageIndex === currentPreviewIndex) ? previewedImage : null;
              const imageSrc = cachedWatermark || currentPreview || img.imageBase64;
              const displaySrc = imageSrc.startsWith('data:')
                ? imageSrc
                : `data:image/png;base64,${imageSrc}`;

              return (
                <>
                  <img
                    src={displaySrc}
                    alt="Expanded preview"
                    className="max-w-full max-h-[90vh] object-contain rounded-lg"
                  />
                  {/* Loading overlay when applying watermark */}
                  {isPreviewingWatermark && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                      <Loader2 className="h-12 w-12 animate-spin text-white" />
                    </div>
                  )}
                </>
              );
            })()}
            <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent rounded-b-lg">
              <p className="text-white text-xl font-semibold">
                {generatedImages[currentPreviewIndex]?.theme?.name || `Image ${currentPreviewIndex + 1}`}
              </p>
              <p className="text-white/70">
                {domain.fqdn} • {currentPreviewIndex + 1} of {generatedImages.length}
                {(watermarkedCache[currentPreviewIndex] || (selectedImageIndex === currentPreviewIndex && previewedImage)) && ` • ${watermarkStyle} watermark`}
              </p>
            </div>
          </div>

          {/* Right Arrow */}
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); navigateNext(); }}
            disabled={generatedImages.length <= 1 || isPreviewingWatermark}
            className="absolute right-4 h-14 w-14 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <ChevronRightIcon className="h-8 w-8" />
          </Button>

          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(false)}
            className="absolute top-4 right-4 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default NFTCustomizeModal;
