"use client";

import { useState, useEffect } from "react";
import { Check, X, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FluxGenerationImage } from "@/services/api";

interface ImageGalleryProps {
  images: FluxGenerationImage[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onExpand?: (index: number) => void;
  previewIndex?: number | null;
  onPreviewChange?: (index: number | null) => void;
  className?: string;
}

export function ImageGallery({
  images,
  selectedIndex,
  onSelect,
  onExpand,
  previewIndex: controlledPreviewIndex,
  onPreviewChange,
  className,
}: ImageGalleryProps) {
  const successfulImages = images.filter((img) => img.success);

  // Use controlled preview index if provided, otherwise use local state
  const isControlled = controlledPreviewIndex !== undefined && onPreviewChange !== undefined;

  const [localPreviewIndex, setLocalPreviewIndex] = useState<number | null>(
    selectedIndex ?? (successfulImages.length > 0 ? images.indexOf(successfulImages[0]) : null)
  );

  const previewIndex = isControlled ? controlledPreviewIndex : localPreviewIndex;
  const setPreviewIndex = isControlled
    ? onPreviewChange
    : setLocalPreviewIndex;

  // Update preview when selection changes
  useEffect(() => {
    if (selectedIndex !== null) {
      setPreviewIndex(selectedIndex);
    }
  }, [selectedIndex, setPreviewIndex]);

  const previewImage = previewIndex !== null ? images[previewIndex] : null;

  const navigatePrev = () => {
    if (!previewIndex) return;
    for (let i = previewIndex - 1; i >= 0; i--) {
      if (images[i]?.success) {
        setPreviewIndex(i);
        return;
      }
    }
    // Wrap around
    for (let i = images.length - 1; i > previewIndex; i--) {
      if (images[i]?.success) {
        setPreviewIndex(i);
        return;
      }
    }
  };

  const navigateNext = () => {
    if (previewIndex === null) return;
    for (let i = previewIndex + 1; i < images.length; i++) {
      if (images[i]?.success) {
        setPreviewIndex(i);
        return;
      }
    }
    // Wrap around
    for (let i = 0; i < previewIndex; i++) {
      if (images[i]?.success) {
        setPreviewIndex(i);
        return;
      }
    }
  };

  if (images.length === 0) return null;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main Preview */}
      {previewImage?.success && (
        <div className="rounded-xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-4">
          <div className="space-y-3">
            {/* Preview Header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Preview
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  getCategoryBorderClass(previewImage.theme.category)
                )}
              >
                {previewImage.theme.name}
              </Badge>
            </div>

            {/* Main Preview Image */}
            <div className="relative flex justify-center">
              {/* Navigation arrows */}
              {successfulImages.length > 1 && (
                <>
                  <button
                    onClick={navigatePrev}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={navigateNext}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {/* The preview image */}
              <div
                className={cn(
                  "relative w-80 h-80 md:w-96 md:h-96 rounded-lg overflow-hidden cursor-pointer transition-all duration-300 shadow-lg",
                  selectedIndex === previewIndex &&
                    "ring-2 ring-green-500 ring-offset-2 ring-offset-background"
                )}
                onClick={() => onExpand?.(previewIndex!)}
              >
                <img
                  src={previewImage.imageBase64}
                  alt={previewImage.theme.name}
                  className="w-full h-full object-cover"
                />
                {/* Selection overlay */}
                {selectedIndex === previewIndex && (
                  <div className="absolute top-2 right-2">
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  </div>
                )}
                {/* Click to expand hint */}
                <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                  <span className="text-white text-xs bg-black/50 px-2 py-1 rounded">
                    Click to expand
                  </span>
                </div>
              </div>
            </div>

            {/* Image counter dots */}
            {successfulImages.length > 1 && (
              <div className="flex justify-center gap-1.5">
                {successfulImages.map((img, i) => {
                  const realIdx = images.indexOf(img);
                  return (
                    <button
                      key={i}
                      onClick={() => setPreviewIndex(realIdx)}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all",
                        realIdx === previewIndex
                          ? "bg-primary w-4"
                          : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                      )}
                    />
                  );
                })}
              </div>
            )}

            {/* Select button */}
            <div className="flex justify-center">
              <Button
                onClick={() => previewIndex !== null && onSelect(previewIndex)}
                variant={selectedIndex === previewIndex ? "default" : "outline"}
                size="sm"
                className={cn(
                  "min-w-[140px]",
                  selectedIndex === previewIndex &&
                    "bg-green-500 hover:bg-green-600"
                )}
              >
                {selectedIndex === previewIndex ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Selected for NFT
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1" />
                    Select This Image
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Thumbnail Strip */}
      <div className="space-y-2 p-3 rounded-lg border border-primary/10 bg-primary/5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">All Variations</span>
          <span className="text-xs text-muted-foreground">
            {successfulImages.length} of {images.length}
          </span>
        </div>

        {/* Horizontal Scrolling Thumbnails */}
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="flex-shrink-0"
                onClick={() => {
                  if (img.success) {
                    setPreviewIndex(idx);
                  }
                }}
              >
                <div
                  className={cn(
                    "relative w-16 h-16 rounded-md overflow-hidden cursor-pointer transition-all duration-200",
                    img.success
                      ? "hover:ring-2 hover:ring-primary/50"
                      : "opacity-50 cursor-not-allowed",
                    selectedIndex === idx && "ring-2 ring-green-500",
                    previewIndex === idx && selectedIndex !== idx && "ring-2 ring-primary/50"
                  )}
                >
                  {img.success && img.imageBase64 ? (
                    <>
                      <img
                        src={img.imageBase64}
                        alt={img.theme.name}
                        className="w-full h-full object-cover"
                      />
                      {selectedIndex === idx && (
                        <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
                          <Check className="h-4 w-4 text-white drop-shadow" />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-red-500/10 text-red-500">
                      <X className="h-4 w-4" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper for category border colors
function getCategoryBorderClass(category: string): string {
  const map: Record<string, string> = {
    exotic: "border-amber-500/50 text-amber-400",
    jobs: "border-cyan-500/50 text-cyan-400",
    fantasy: "border-rose-500/50 text-rose-400",
    fractal: "border-amber-500/50 text-amber-400",
    nature: "border-teal-500/50 text-teal-400",
    space: "border-amber-500/50 text-amber-400",
    business: "border-green-500/50 text-green-400",
  };
  return map[category] || "border-green-500/50 text-green-400";
}

// Expanded Image Modal
interface ExpandedImageModalProps {
  images: FluxGenerationImage[];
  expandedIndex: number | null;
  selectedIndex: number | null;
  onClose: () => void;
  onSelect: (index: number) => void;
  onNavigate: (index: number) => void;
}

export function ExpandedImageModal({
  images,
  expandedIndex,
  selectedIndex,
  onClose,
  onSelect,
  onNavigate,
}: ExpandedImageModalProps) {
  const isOpen = expandedIndex !== null && images[expandedIndex];

  const currentImage = isOpen ? images[expandedIndex] : null;
  const hasPrev = isOpen ? images.slice(0, expandedIndex).some((img) => img.success) : false;
  const hasNext = isOpen ? images.slice(expandedIndex + 1).some((img) => img.success) : false;

  const navigatePrev = () => {
    if (expandedIndex === null) return;
    for (let i = expandedIndex - 1; i >= 0; i--) {
      if (images[i]?.success) {
        onNavigate(i);
        return;
      }
    }
  };

  const navigateNext = () => {
    if (expandedIndex === null) return;
    for (let i = expandedIndex + 1; i < images.length; i++) {
      if (images[i]?.success) {
        onNavigate(i);
        return;
      }
    }
  };

  // Keyboard navigation - must be called unconditionally (React hooks rule)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keyboard events when user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        navigatePrev();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        navigateNext();
      } else if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (expandedIndex !== null) onSelect(expandedIndex);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedIndex, isOpen, onClose, onSelect]);

  if (!isOpen || !currentImage) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Left Arrow */}
      {hasPrev && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all hover:scale-110 backdrop-blur-sm z-10"
          onClick={(e) => {
            e.stopPropagation();
            navigatePrev();
          }}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Right Arrow */}
      {hasNext && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all hover:scale-110 backdrop-blur-sm z-10"
          onClick={(e) => {
            e.stopPropagation();
            navigateNext();
          }}
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Image container */}
      <div
        className="relative flex items-center justify-center mx-4 sm:mx-16"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={currentImage.imageBase64}
          alt={currentImage.theme.name}
          className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
        />

        {/* Top bar - Close + Counter */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          {/* Image counter */}
          <div className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm text-white text-sm font-medium">
            {expandedIndex + 1} / {images.length}
          </div>

          {/* Close button */}
          <button
            className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors backdrop-blur-sm"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Bottom bar - Theme + Select */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          {/* Theme label */}
          <div
            className={cn(
              "py-2 px-4 rounded-lg text-white font-medium backdrop-blur-sm",
              getCategoryBgClass(currentImage.theme.category)
            )}
          >
            {currentImage.theme.name}
          </div>

          {/* Select button */}
          <button
            className={cn(
              "py-2 px-6 rounded-lg font-medium transition-all flex items-center gap-2",
              selectedIndex === expandedIndex
                ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/30"
                : "bg-white text-black hover:bg-gray-100"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(expandedIndex);
            }}
          >
            {selectedIndex === expandedIndex ? (
              <>
                <Check className="h-4 w-4" /> Selected for NFT
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Select for NFT
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function getCategoryBgClass(category: string): string {
  const map: Record<string, string> = {
    exotic: "bg-amber-600/80",
    jobs: "bg-cyan-600/80",
    fantasy: "bg-rose-600/80",
    fractal: "bg-amber-600/80",
    nature: "bg-teal-600/80",
    space: "bg-amber-600/80",
    business: "bg-green-600/80",
  };
  return map[category] || "bg-green-600/80";
}
