"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardStep } from "../../hooks/useWizardState";

interface WizardProgressProps {
  currentStep: WizardStep;
  completedSteps: Set<WizardStep>;
  onStepClick?: (step: WizardStep) => void;
}

const STEPS: { id: WizardStep; label: string; shortLabel: string }[] = [
  { id: "model", label: "Choose Model", shortLabel: "Model" },
  { id: "style", label: "Art Style", shortLabel: "Style" },
  { id: "theme", label: "Select Themes", shortLabel: "Themes" },
  { id: "prompt", label: "Describe Subject", shortLabel: "Prompt" },
  { id: "generate", label: "Generate", shortLabel: "Generate" },
];

export function WizardProgress({
  currentStep,
  completedSteps,
  onStepClick,
}: WizardProgressProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 py-4 overflow-x-auto">
      {STEPS.map((step, index) => {
        const isCompleted = completedSteps.has(step.id);
        const isCurrent = step.id === currentStep;
        const isAccessible = index <= currentIndex || isCompleted;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step Circle */}
            <button
              onClick={() => isAccessible && onStepClick?.(step.id)}
              disabled={!isAccessible}
              className={cn(
                "flex flex-col items-center gap-1 transition-all",
                isAccessible ? "cursor-pointer" : "cursor-not-allowed opacity-50"
              )}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all",
                  isCompleted
                    ? "bg-[hsl(var(--halcyon-green))] text-white"
                    : isCurrent
                      ? "bg-[hsl(var(--halcyon-teal))] text-white ring-4 ring-[hsl(var(--halcyon-teal))]/30"
                      : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                )}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : index + 1}
              </div>
              <span
                className={cn(
                  "text-xs font-medium hidden sm:block",
                  isCurrent
                    ? "text-[hsl(var(--halcyon-teal))]"
                    : isCompleted
                      ? "text-[hsl(var(--halcyon-green))]"
                      : "text-[hsl(var(--muted-foreground))]"
                )}
              >
                {step.shortLabel}
              </span>
            </button>

            {/* Connector Line */}
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-8 sm:w-12 h-0.5 mx-1 sm:mx-2 transition-colors",
                  completedSteps.has(STEPS[index + 1].id) || (isCompleted && index < currentIndex)
                    ? "bg-[hsl(var(--halcyon-green))]"
                    : "bg-[hsl(var(--muted))]"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
