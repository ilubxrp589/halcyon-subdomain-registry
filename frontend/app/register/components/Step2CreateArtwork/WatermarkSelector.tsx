"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Droplets, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getWatermarkStyles, WatermarkStyle } from "@/services/api";

interface WatermarkSelectorProps {
  selectedStyle: string;
  onStyleChange: (styleId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function WatermarkSelector({
  selectedStyle,
  onStyleChange,
  disabled = false,
  className,
}: WatermarkSelectorProps) {
  const [styles, setStyles] = useState<WatermarkStyle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultStyle, setDefaultStyle] = useState("cinematic");
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag to scroll state
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);

  useEffect(() => {
    loadStyles();
  }, []);

  const loadStyles = async () => {
    try {
      const result = await getWatermarkStyles();
      if (result.success) {
        setStyles(result.styles);
        setDefaultStyle(result.default);
        // Find current index
        const idx = result.styles.findIndex(s => s.id === selectedStyle);
        if (idx >= 0) setCurrentIndex(idx);
        // If no style selected, use default
        if (!selectedStyle && result.default) {
          onStyleChange(result.default);
        }
      }
    } catch (err) {
      console.error('Failed to load watermark styles:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Update index when selectedStyle changes
  useEffect(() => {
    const idx = styles.findIndex(s => s.id === selectedStyle);
    if (idx >= 0) setCurrentIndex(idx);
  }, [selectedStyle, styles]);

  // Navigate to previous/next watermark style
  const handlePrevStyle = useCallback(() => {
    if (disabled || styles.length === 0) return;
    const newIndex = currentIndex === 0 ? styles.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
    onStyleChange(styles[newIndex].id);
    // Scroll to the new selection
    scrollToIndex(newIndex);
  }, [currentIndex, styles, disabled, onStyleChange]);

  const handleNextStyle = useCallback(() => {
    if (disabled || styles.length === 0) return;
    const newIndex = currentIndex === styles.length - 1 ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
    onStyleChange(styles[newIndex].id);
    // Scroll to the new selection
    scrollToIndex(newIndex);
  }, [currentIndex, styles, disabled, onStyleChange]);

  const scrollToIndex = (index: number) => {
    if (scrollRef.current) {
      const selectedEl = scrollRef.current.querySelector(`[data-style-index="${index}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  };

  // Drag to scroll handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setHasDragged(false);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(walk) > 5) {
      setHasDragged(true);
    }
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleStyleClick = (styleId: string, index: number) => {
    if (disabled || hasDragged) return;
    setCurrentIndex(index);
    onStyleChange(styleId);
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center gap-2 py-4", className)}>
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Loading styles...</span>
      </div>
    );
  }

  if (styles.length === 0) {
    return null;
  }

  const currentStyle = styles[currentIndex];

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header with prominent navigation */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          <Droplets className="w-4 h-4 text-primary" />
          Watermark Style
        </label>

        {/* Big obvious arrows for watermark */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevStyle}
            disabled={disabled}
            className="h-9 w-9 rounded-full border-2 border-primary/50 hover:border-primary hover:bg-primary/10"
          >
            <ChevronLeft className="w-5 h-5 text-primary" />
          </Button>

          <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/30 min-w-[120px] text-center">
            <span className="text-sm font-semibold text-primary">
              {currentStyle?.name}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNextStyle}
            disabled={disabled}
            className="h-9 w-9 rounded-full border-2 border-primary/50 hover:border-primary hover:bg-primary/10"
          >
            <ChevronRight className="w-5 h-5 text-primary" />
          </Button>
        </div>
      </div>

      {/* Scrollable Pills - drag to browse */}
      <div className="relative">
        <div
          ref={scrollRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          className={cn(
            "flex gap-2 overflow-x-auto scrollbar-hide py-1 px-1 select-none",
            isDragging ? "cursor-grabbing" : "cursor-grab"
          )}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {styles.map((style, index) => (
            <button
              key={style.id}
              data-style={style.id}
              data-style-index={index}
              onClick={() => handleStyleClick(style.id, index)}
              disabled={disabled}
              className={cn(
                "shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all",
                "border-2 whitespace-nowrap",
                currentIndex === index
                  ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25 scale-105"
                  : "bg-secondary/50 text-foreground border-transparent hover:border-primary/50 hover:bg-secondary",
                disabled && "opacity-50 cursor-not-allowed",
                style.id === defaultStyle && currentIndex !== index && "ring-1 ring-primary/30"
              )}
            >
              {style.name}
              {style.id === defaultStyle && currentIndex !== index && (
                <span className="ml-1.5 text-[10px] opacity-60">★</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Helper text */}
      <p className="text-xs text-muted-foreground text-center">
        Use arrows above or drag to browse • {currentIndex + 1} of {styles.length}
      </p>
    </div>
  );
}

export default WatermarkSelector;
