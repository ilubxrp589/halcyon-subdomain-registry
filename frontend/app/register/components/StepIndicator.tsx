"use client";

import { Check, Search, Sparkles, ShieldCheck, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Step = "search" | "confirm" | "processing" | "success";

interface StepConfig {
  key: Step;
  label: string;
  icon: LucideIcon;
}

const STEPS: StepConfig[] = [
  { key: "search", label: "Search", icon: Search },
  { key: "confirm", label: "Customize", icon: Sparkles },
  { key: "processing", label: "Confirm", icon: ShieldCheck },
  { key: "success", label: "Complete", icon: Check },
];

interface StepIndicatorProps {
  currentStep: Step;
  className?: string;
}

export function StepIndicator({ currentStep, className }: StepIndicatorProps) {
  const stepOrder: Step[] = ["search", "confirm", "processing", "success"];
  const currentIndex = stepOrder.indexOf(currentStep);

  return (
    <div className={cn("mb-8", className)}>
      <div className="flex items-center justify-center gap-2 sm:gap-4">
        {STEPS.map((step, i) => {
          const stepIndex = stepOrder.indexOf(step.key);
          const isActive = currentStep === step.key;
          const isCompleted = stepIndex < currentIndex;
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 transition-all",
                    isCompleted
                      ? "bg-green-500 border-green-500 text-white"
                      : isActive
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-muted border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                  ) : (
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs sm:text-sm mt-1 font-medium",
                    isActive
                      ? "text-foreground"
                      : isCompleted
                      ? "text-green-500"
                      : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "w-8 sm:w-16 h-0.5 mx-1 sm:mx-2 mt-[-1rem]",
                    stepIndex < currentIndex
                      ? "bg-green-500"
                      : "bg-muted-foreground/30"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
