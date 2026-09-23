"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThemeCategory = "business" | "exotic" | "jobs" | "fantasy" | "fractal" | "nature" | "space" | "anime" | "popular" | "artistic" | "photography" | "digital" | "abstract";

const categoryStyles: Record<ThemeCategory, { bg: string; text: string; border: string; hover: string }> = {
  business: {
    bg: "bg-green-500/10",
    text: "text-green-600 dark:text-green-400",
    border: "border-green-500/30",
    hover: "hover:bg-green-500/20",
  },
  exotic: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
    hover: "hover:bg-amber-500/20",
  },
  jobs: {
    bg: "bg-cyan-500/10",
    text: "text-cyan-600 dark:text-cyan-400",
    border: "border-cyan-500/30",
    hover: "hover:bg-cyan-500/20",
  },
  fantasy: {
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-500/30",
    hover: "hover:bg-rose-500/20",
  },
  fractal: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
    hover: "hover:bg-amber-500/20",
  },
  nature: {
    bg: "bg-teal-500/10",
    text: "text-teal-600 dark:text-teal-400",
    border: "border-teal-500/30",
    hover: "hover:bg-teal-500/20",
  },
  space: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
    hover: "hover:bg-amber-500/20",
  },
  anime: {
    bg: "bg-pink-500/10",
    text: "text-pink-600 dark:text-pink-400",
    border: "border-pink-500/30",
    hover: "hover:bg-pink-500/20",
  },
  popular: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-600 dark:text-yellow-400",
    border: "border-yellow-500/30",
    hover: "hover:bg-yellow-500/20",
  },
  artistic: {
    bg: "bg-pink-500/10",
    text: "text-pink-600 dark:text-pink-400",
    border: "border-pink-500/30",
    hover: "hover:bg-pink-500/20",
  },
  photography: {
    bg: "bg-slate-500/10",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-slate-500/30",
    hover: "hover:bg-slate-500/20",
  },
  digital: {
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/30",
    hover: "hover:bg-blue-500/20",
  },
  abstract: {
    bg: "bg-orange-500/10",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-500/30",
    hover: "hover:bg-orange-500/20",
  },
};

interface ThemeChipProps {
  name: string;
  category: ThemeCategory;
  selected?: boolean;
  selectionIndex?: number;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function ThemeChip({
  name,
  category,
  selected = false,
  selectionIndex,
  onRemove,
  onClick,
  className,
  size = "md",
}: ThemeChipProps) {
  const styles = categoryStyles[category] || categoryStyles.business;

  const sizeStyles = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1.5 text-sm",
    lg: "px-4 py-2 text-base",
  };

  return (
    <button
      onClick={onClick || onRemove}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium transition-all",
        sizeStyles[size],
        selected
          ? `${styles.bg} ${styles.text} ${styles.border}`
          : "bg-card border-border hover:border-primary/50",
        onClick && !selected && styles.hover,
        className
      )}
    >
      {selectionIndex !== undefined && (
        <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-xs font-bold">
          {selectionIndex}
        </span>
      )}
      <span className="truncate max-w-[150px]">{name}</span>
      {onRemove && (
        <X
          className="h-3 w-3 ml-0.5 hover:scale-110 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      )}
    </button>
  );
}

// Grid of selected theme chips
interface SelectedThemesProps {
  themes: { id: string; name: string; category: ThemeCategory }[];
  maxThemes?: number;
  onRemove: (id: string) => void;
  className?: string;
}

export function SelectedThemes({
  themes,
  maxThemes = 5,
  onRemove,
  className,
}: SelectedThemesProps) {
  if (themes.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2 p-3 rounded-lg bg-secondary/30 border", className)}>
      {themes.map((theme, idx) => (
        <ThemeChip
          key={theme.id}
          name={theme.name}
          category={theme.category}
          selected
          selectionIndex={idx + 1}
          onRemove={() => onRemove(theme.id)}
        />
      ))}
      {themes.length < maxThemes && (
        <span className="text-xs text-muted-foreground self-center px-2">
          Select {maxThemes - themes.length} more...
        </span>
      )}
    </div>
  );
}
