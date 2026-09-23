"use client";

import { MessageSquare, Globe, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassmorphicCard } from "../ui/GlassmorphicCard";
import { HalcyonButton } from "../ui/AnimatedButton";

interface PromptInputCardProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onConfirm: () => void;
  domain: { subdomain: string; tld: string } | null;
  selectedModel: "playground" | "animagine" | null;
  selectedTheme: string | null;
  selectedArtStyle: string | null;
  isExpanded: boolean;
  isCompleted: boolean;
  onCardClick: () => void;
}

const MAX_LENGTH = 350;

export function PromptInputCard({
  prompt,
  onPromptChange,
  onConfirm,
  domain,
  selectedModel,
  selectedTheme,
  selectedArtStyle,
  isExpanded,
  isCompleted,
  onCardClick,
}: PromptInputCardProps) {
  const handleChange = (value: string) => {
    if (value.length <= MAX_LENGTH) {
      onPromptChange(value);
    }
  };

  return (
    <GlassmorphicCard
      isExpanded={isExpanded}
      isCompleted={isCompleted}
      isActive={isExpanded && !isCompleted}
      onClick={onCardClick}
      stepNumber={4}
      header={
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[hsl(var(--halcyon-teal))]/20">
            <MessageSquare className="h-5 w-5 text-[hsl(var(--halcyon-teal))]" />
          </div>
          <div>
            <h3 className="font-semibold">Describe Subject</h3>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              What should be in your image?
            </p>
          </div>
        </div>
      }
      completedSummary={
        prompt ? (
          <span className="text-[hsl(var(--halcyon-green))] font-medium truncate">
            {prompt.slice(0, 50)}
            {prompt.length > 50 && "..."}
          </span>
        ) : (
          <span className="text-[hsl(var(--muted-foreground))]">
            Using theme defaults
          </span>
        )
      }
    >
      {/* Domain Preview */}
      {domain && (
        <div className="mb-4 p-3 rounded-lg bg-[hsl(var(--muted))]/50 flex items-center gap-3">
          <Globe className="h-5 w-5 text-[hsl(var(--halcyon-teal))]" />
          <span className="font-mono font-bold">
            {domain.subdomain}.{domain.tld}
          </span>
        </div>
      )}

      {/* Prompt Input - NO SUGGESTION BOX */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Subject Description{" "}
          <span className="text-[hsl(var(--muted-foreground))]">(optional)</span>
        </label>
        <textarea
          value={prompt}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="e.g., bigfoot catching a fish by a mountain lake"
          className={cn(
            "w-full h-24 p-3 rounded-lg resize-none",
            "bg-[hsl(var(--background))]/50 border border-[hsl(var(--border))]",
            "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--halcyon-teal))]/50",
            "placeholder:text-[hsl(var(--muted-foreground))]/70"
          )}
        />
        <div className="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
          <span>Describe what should appear in your NFT image</span>
          <span
            className={cn(
              prompt.length > MAX_LENGTH * 0.9 &&
                "text-[hsl(var(--destructive))]"
            )}
          >
            {prompt.length}/{MAX_LENGTH}
          </span>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-4 p-3 rounded-lg bg-[hsl(var(--muted))]/30 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[hsl(var(--muted-foreground))]">Model:</span>
          <span className="font-medium">
            {selectedModel === "playground" ? "SDXL Playground" : "Animagine"}
          </span>
        </div>
        {selectedArtStyle && (
          <div className="flex justify-between">
            <span className="text-[hsl(var(--muted-foreground))]">Art Style:</span>
            <span className="font-medium capitalize">{selectedArtStyle}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-[hsl(var(--muted-foreground))]">Theme:</span>
          <span className="font-medium">{selectedTheme ? "1 selected" : "None"}</span>
        </div>
      </div>

      {/* Continue */}
      <div className="flex justify-end mt-4 pt-4 border-t border-[hsl(var(--border))]">
        <HalcyonButton variant="primary" onClick={onConfirm}>
          <span className="flex items-center gap-2">
            Ready to Generate
            <ChevronRight className="h-4 w-4" />
          </span>
        </HalcyonButton>
      </div>
    </GlassmorphicCard>
  );
}
