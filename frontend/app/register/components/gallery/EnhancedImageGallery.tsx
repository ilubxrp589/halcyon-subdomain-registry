"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { CheckCircle, ChevronLeft, ChevronRight, ZoomIn, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SharePreview } from "./SharePreview";
import type { FluxGenerationImage } from "@/services/api";

interface EnhancedImageGalleryProps {
  images: FluxGenerationImage[];
  selectedIndex: number | null;
  onSelectImage: (index: number) => void;
  domain: string;
  className?: string;
}

export function EnhancedImageGallery({
  images,
  selectedIndex,
  onSelectImage,
  domain,
  className,
}: EnhancedImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);
  const prevImagesLengthRef = useRef(images.length);

  const validImages = useMemo(
    () => images.filter((img) => img.success && img.imageBase64),
    [images]
  );

  // Auto-jump to newest images when more are added
  useEffect(() => {
    const prevLength = prevImagesLengthRef.current;
    const newLength = validImages.length;

    if (newLength > prevLength && prevLength > 0) {
      // New images added - jump to first new one
      setActiveIndex(prevLength);
    }

    prevImagesLengthRef.current = newLength;
  }, [validImages.length]);

  // Sync activeIndex with selectedIndex when explicitly selected
  // Only run when selectedIndex changes, not on every activeIndex change
  const prevSelectedIndexRef = useRef(selectedIndex);
  useEffect(() => {
    // Only sync if selectedIndex actually changed
    if (selectedIndex !== prevSelectedIndexRef.current) {
      prevSelectedIndexRef.current = selectedIndex;

      if (selectedIndex !== null && selectedIndex >= 0) {
        const selectedImage = images[selectedIndex];
        if (selectedImage?.success && selectedImage?.imageBase64) {
          const validIndex = validImages.findIndex(
            (img) =>
              img.generationId === selectedImage.generationId &&
              img.index === selectedImage.index
          );
          if (validIndex >= 0) {
            setActiveIndex(validIndex);
          }
        }
      }
    }
  }, [selectedIndex, images, validImages]);

  // Keep activeIndex in bounds
  useEffect(() => {
    if (validImages.length > 0 && activeIndex >= validImages.length) {
      setActiveIndex(validImages.length - 1);
    }
  }, [validImages.length, activeIndex]);

  // Helper to get image src - handles both raw base64 and data URLs
  const getImageSrc = (base64: string | undefined) => {
    if (!base64) return "";
    // If it already has the data URL prefix, use as-is
    if (base64.startsWith("data:")) return base64;
    // Otherwise add the prefix
    return `data:image/png;base64,${base64}`;
  };

  // Show message if no valid images
  if (validImages.length === 0) {
    const failedCount = images.filter((img) => !img.success).length;
    if (failedCount > 0) {
      return (
        <div className="text-center py-8 text-[hsl(var(--muted-foreground))]">
          <p>Generation failed for {failedCount} image(s).</p>
          <p className="text-sm mt-2">Please try generating again.</p>
        </div>
      );
    }
    return null;
  }

  const activeImage = validImages[activeIndex];

  const goToPrevious = () => {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : validImages.length - 1));
  };

  const goToNext = () => {
    setActiveIndex((prev) => (prev < validImages.length - 1 ? prev + 1 : 0));
  };

  const handleSelect = (index: number) => {
    setActiveIndex(index);
    onSelectImage(images.indexOf(validImages[index]));
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main Image Display */}
      <div className="relative rounded-xl overflow-hidden bg-[hsl(var(--muted))] aspect-square max-w-md mx-auto">
        {/* Main Image */}
        {activeImage?.imageBase64 ? (
          <img
            src={getImageSrc(activeImage.imageBase64)}
            alt={`Generated image ${activeIndex + 1}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              console.error("Image failed to load:", activeImage.theme?.name);
              (e.target as HTMLImageElement).src = "";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[hsl(var(--muted))]">
            <span className="text-[hsl(var(--muted-foreground))]">Image not available</span>
          </div>
        )}

        {/* Navigation Arrows */}
        {validImages.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        {/* Zoom Button */}
        <button
          onClick={() => setShowLightbox(true)}
          className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        >
          <ZoomIn className="h-5 w-5" />
        </button>

        {/* Selection Badge */}
        {selectedIndex !== null &&
          images.indexOf(validImages[activeIndex]) === selectedIndex && (
            <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-[hsl(var(--halcyon-green))] text-white text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Selected
            </div>
          )}

        {/* Theme Info */}
        <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <div className="font-medium text-white">{activeImage?.theme?.name}</div>
          <div className="text-sm text-white/70 capitalize">
            {activeImage?.theme?.category}
          </div>
        </div>
      </div>

      {/* Thumbnail Slider */}
      <div className="image-slider-container max-w-2xl mx-auto">
        <div className="flex gap-2 overflow-x-scroll">
          {validImages.map((img, idx) => {
            const originalIndex = images.indexOf(img);
            const isActive = idx === activeIndex;
            const isSelected = originalIndex === selectedIndex;

            return (
              <button
                key={idx}
                onClick={() => handleSelect(idx)}
                className={cn(
                  "image-slider-thumb relative flex-shrink-0 overflow-hidden",
                  isActive && "ring-2 ring-[hsl(var(--halcyon-teal))]",
                  isSelected && "image-slider-thumb-selected"
                )}
              >
                <img
                  src={getImageSrc(img.imageBase64)}
                  alt={`Thumbnail ${idx + 1}`}
                  className="w-full h-full object-cover"
                />

                {/* Selection Indicator */}
                {isSelected && (
                  <div className="absolute inset-0 bg-[hsl(var(--halcyon-green))]/30 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-white drop-shadow-lg" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-[hsl(var(--muted-foreground))]">
          Click an image to select it for your NFT
        </div>

        {activeImage && (
          <SharePreview
            imageBase64={activeImage.imageBase64 || ""}
            domain={domain}
            theme={activeImage.theme?.name || ""}
            generationId={activeImage.generationId}
          />
        )}
      </div>

      {/* Lightbox */}
      {showLightbox && activeImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setShowLightbox(false)}
        >
          <button
            onClick={() => setShowLightbox(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>

          <img
            src={getImageSrc(activeImage.imageBase64)}
            alt="Full size preview"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
