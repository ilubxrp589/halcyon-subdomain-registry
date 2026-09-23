"use client";

import { Camera, Palette, CheckCircle, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassmorphicCard } from "../ui/GlassmorphicCard";

const MODELS = [
  {
    id: "playground" as const,
    name: "SDXL Playground",
    description: "High-quality photorealistic images with exceptional detail and lighting",
    icon: Camera,
    gradient: "from-blue-500 to-amber-600",
  },
  {
    id: "animagine" as const,
    name: "Animagine",
    description: "Stylized anime aesthetic with vibrant colors and expressive characters",
    icon: Palette,
    gradient: "from-pink-500 to-orange-500",
  },
];

interface ModelSelectorProps {
  selectedModel: "playground" | "animagine" | null;
  onSelect: (model: "playground" | "animagine") => void;
  isExpanded: boolean;
  isCompleted: boolean;
  onCardClick: () => void;
}

export function ModelSelector({
  selectedModel,
  onSelect,
  isExpanded,
  isCompleted,
  onCardClick,
}: ModelSelectorProps) {
  const selectedModelInfo = MODELS.find((m) => m.id === selectedModel);

  return (
    <GlassmorphicCard
      isExpanded={isExpanded}
      isCompleted={isCompleted}
      isActive={isExpanded && !isCompleted}
      onClick={onCardClick}
      stepNumber={1}
      header={
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[hsl(var(--halcyon-teal))]/20">
            <Cpu className="h-5 w-5 text-[hsl(var(--halcyon-teal))]" />
          </div>
          <div>
            <h3 className="font-semibold">Choose Model</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Select AI generation model
            </p>
          </div>
        </div>
      }
      completedSummary={
        selectedModelInfo && (
          <span className="text-[hsl(var(--halcyon-green))] font-medium">
            {selectedModelInfo.name}
          </span>
        )
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MODELS.map((model) => {
          const Icon = model.icon;
          const isSelected = selectedModel === model.id;

          return (
            <button
              key={model.id}
              onClick={() => onSelect(model.id)}
              className={cn(
                "relative p-6 rounded-xl border-2 transition-all text-left",
                "hover:scale-[1.02] active:scale-[0.98]",
                "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--halcyon-teal))]/50",
                isSelected
                  ? "border-[hsl(var(--halcyon-green))] bg-[hsl(var(--halcyon-green))]/10"
                  : "border-[hsl(var(--border))] hover:border-[hsl(var(--halcyon-teal))]/50 bg-[hsl(var(--background))]/50"
              )}
            >
              {/* Gradient Background */}
              <div
                className={cn(
                  "absolute inset-0 rounded-xl opacity-10 bg-gradient-to-br",
                  model.gradient
                )}
              />

              <div className="relative">
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
                    "bg-gradient-to-br",
                    model.gradient
                  )}
                >
                  <Icon className="h-6 w-6 text-white" />
                </div>

                <h4 className="font-bold text-lg mb-1">{model.name}</h4>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {model.description}
                </p>

                {isSelected && (
                  <div className="absolute top-4 right-4">
                    <CheckCircle className="h-6 w-6 text-[hsl(var(--halcyon-green))]" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))] text-center">
        Click a model to select and continue to art style selection
      </p>
    </GlassmorphicCard>
  );
}
