"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles } from "lucide-react";

interface AnimatedButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
  className?: string;
  showCredits?: boolean;
  credits?: number;
}

// Multi-phase easing for perceived faster loading
// Phase 1: 0-10% in 2s (fast burst)
// Phase 2: 10-60% in 30s (steady)
// Phase 3: 60-90% in 15s (slowing)
// Phase 4: 90-95% crawl until complete
function getProgressPhase(elapsed: number): number {
  const phase1End = 2000;
  const phase2End = 32000;
  const phase3End = 47000;

  if (elapsed < phase1End) {
    // Fast burst to 10%
    const t = elapsed / phase1End;
    return t * 10;
  } else if (elapsed < phase2End) {
    // Steady progress to 60%
    const t = (elapsed - phase1End) / (phase2End - phase1End);
    return 10 + t * 50;
  } else if (elapsed < phase3End) {
    // Slowing down to 90%
    const t = (elapsed - phase2End) / (phase3End - phase2End);
    const eased = 1 - Math.pow(1 - t, 2); // ease out
    return 60 + eased * 30;
  } else {
    // Crawl from 90-95%
    const t = Math.min((elapsed - phase3End) / 20000, 1);
    return 90 + t * 5;
  }
}

export function AnimatedGenerateButton({
  onClick,
  disabled = false,
  isLoading = false,
  loadingText = "Generating...",
  children,
  className,
  showCredits = true,
  credits = 1,
}: AnimatedButtonProps) {
  const [progress, setProgress] = useState(0);
  const [pulse, setPulse] = useState(false);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Animate progress when loading - 60fps with multi-phase easing
  useEffect(() => {
    if (isLoading) {
      setProgress(0);
      setPulse(true);
      startTimeRef.current = performance.now();

      const animate = (timestamp: number) => {
        if (!startTimeRef.current) return;

        const elapsed = timestamp - startTimeRef.current;
        const newProgress = getProgressPhase(elapsed);
        setProgress(newProgress);

        if (newProgress < 95) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };

      animationRef.current = requestAnimationFrame(animate);

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
        setPulse(false);
      };
    } else {
      // Completion animation
      if (progress > 0) {
        setProgress(100);
        setTimeout(() => setProgress(0), 300);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      setPulse(false);
    }
  }, [isLoading]);

  const circumference = 2 * Math.PI * 46;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        "generate-btn relative px-8 py-4 rounded-xl font-semibold text-white",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "transition-all duration-200",
        "hover:scale-[1.02] active:scale-[0.98]",
        isLoading && "generate-btn-progress",
        pulse && "animate-pulse",
        className
      )}
    >
      {/* Multi-layer Progress Ring SVG (visible when loading) */}
      {isLoading && (
        <div className="absolute -inset-2 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 100 100">
            {/* Outer glow ring */}
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="url(#glowGradient)"
              strokeWidth="1"
              opacity="0.5"
              className="animate-[spin_8s_linear_infinite]"
              strokeDasharray="20 10"
            />

            {/* Background track */}
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="hsl(var(--halcyon-teal) / 0.15)"
              strokeWidth="3"
            />

            {/* Progress ring with gradient */}
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="url(#progressGradient)"
              strokeWidth="3"
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: strokeDashoffset,
                transition: "stroke-dashoffset 0.15s ease-out",
                filter: "drop-shadow(0 0 6px hsl(var(--halcyon-green) / 0.6))",
              }}
            />

            {/* Leading dot glow */}
            {progress > 0 && progress < 100 && (
              <circle
                cx="50"
                cy="4"
                r="2"
                fill="hsl(var(--halcyon-green))"
                style={{
                  transform: `rotate(${(progress / 100) * 360}deg)`,
                  transformOrigin: "50px 50px",
                  filter: "drop-shadow(0 0 4px hsl(var(--halcyon-green)))",
                }}
              />
            )}

            {/* Gradient definitions */}
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--halcyon-teal))" />
                <stop offset="100%" stopColor="hsl(var(--halcyon-green))" />
              </linearGradient>
              <linearGradient id="glowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(var(--halcyon-teal))" stopOpacity="0.8" />
                <stop offset="50%" stopColor="hsl(var(--halcyon-green))" stopOpacity="0.4" />
                <stop offset="100%" stopColor="hsl(var(--halcyon-teal))" stopOpacity="0.8" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      )}

      {/* Button Content */}
      <span className="relative z-10 flex items-center justify-center gap-2">
        {isLoading ? (
          <>
            <div className="relative">
              <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--halcyon-green))]" />
              <div className="absolute inset-0 animate-ping">
                <Sparkles className="h-5 w-5 text-[hsl(var(--halcyon-teal))] opacity-30" />
              </div>
            </div>
            <span>{loadingText}</span>
            <span className="tabular-nums font-mono text-sm bg-white/10 px-2 py-0.5 rounded">
              {Math.round(progress)}%
            </span>
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" />
            <span>{children}</span>
            {showCredits && (
              <span className="text-sm opacity-75">({credits} credit)</span>
            )}
          </>
        )}
      </span>
    </button>
  );
}

// Simple variant for non-generate actions
export function HalcyonButton({
  onClick,
  disabled = false,
  isLoading = false,
  children,
  className,
  variant = "primary",
  size = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "default" | "lg";
}) {
  const baseStyles = "relative font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

  const variantStyles = {
    primary: "btn-halcyon",
    secondary: "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--secondary))]/80",
    ghost: "hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]",
    outline: "border border-[hsl(var(--halcyon-teal))] text-[hsl(var(--halcyon-teal))] hover:bg-[hsl(var(--halcyon-teal))]/10",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-sm",
    default: "px-4 py-2",
    lg: "px-6 py-3 text-lg",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
