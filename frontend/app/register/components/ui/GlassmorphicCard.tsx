"use client";

import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlassmorphicCardProps {
  children: React.ReactNode;
  isExpanded?: boolean;
  isCompleted?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
  header?: React.ReactNode;
  completedSummary?: React.ReactNode;
  stepNumber?: number;
}

export function GlassmorphicCard({
  children,
  isExpanded = true,
  isCompleted = false,
  isActive = false,
  onClick,
  className,
  header,
  completedSummary,
  stepNumber,
}: GlassmorphicCardProps) {
  return (
    <div
      className={cn(
        "glass-card wizard-card",
        isActive && "glass-card-active",
        isCompleted && !isExpanded && "glass-card-completed",
        !isExpanded && "glass-card-collapsed",
        className
      )}
      onClick={!isExpanded ? onClick : undefined}
      role={!isExpanded ? "button" : undefined}
      tabIndex={!isExpanded ? 0 : undefined}
      onKeyDown={
        !isExpanded
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {/* Header - always visible */}
      {header && (
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {stepNumber && (
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                  isCompleted
                    ? "bg-[hsl(var(--halcyon-green))] text-white"
                    : isActive
                      ? "bg-[hsl(var(--halcyon-teal))] text-white"
                      : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                )}
              >
                {isCompleted ? <CheckCircle className="h-5 w-5" /> : stepNumber}
              </div>
            )}
            {header}
          </div>
          {isCompleted && !isExpanded && (
            <CheckCircle className="h-5 w-5 text-[hsl(var(--halcyon-green))]" />
          )}
        </div>
      )}

      {/* Collapsed Summary */}
      {!isExpanded && isCompleted && completedSummary && (
        <div className="px-4 pb-4 text-sm text-[hsl(var(--muted-foreground))]">
          {completedSummary}
        </div>
      )}

      {/* Expandable Content */}
      <div className={cn("collapse-content", isExpanded && "expanded")}>
        <div className="collapse-inner">
          <div className={cn("p-4", header && "pt-0")}>{children}</div>
        </div>
      </div>
    </div>
  );
}
