"use client";

import { useState } from "react";
import { Lightbulb, Wand2, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getPromptSuggestions } from "@/services/api";
import { PlaygroundTips, InlineTip } from "./PlaygroundTips";

const CUSTOM_PROMPT_MAX_LENGTH = 350;

interface PromptSectionProps {
  subdomain: string;
  tld: string;
  customPrompt: string;
  onPromptChange: (prompt: string) => void;
  className?: string;
}

export function PromptSection({
  subdomain,
  tld,
  customPrompt,
  onPromptChange,
  className,
}: PromptSectionProps) {
  const [domainDescription, setDomainDescription] = useState("");
  const [promptSuggestions, setPromptSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number | null>(null);

  const handleGetSuggestions = async () => {
    if (!subdomain) return;
    setIsLoadingSuggestions(true);
    setSelectedSuggestionIndex(null); // Reset selection when generating new suggestions
    try {
      const result = await getPromptSuggestions(subdomain, domainDescription, tld);
      setPromptSuggestions(result.suggestions);
    } catch (err) {
      console.error("Failed to get suggestions:", err);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string, index: number) => {
    onPromptChange(suggestion.slice(0, CUSTOM_PROMPT_MAX_LENGTH));
    setSelectedSuggestionIndex(index);
    // Keep suggestions visible - don't clear them
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Need Ideas? Section */}
      <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Lightbulb className="h-4 w-4 text-yellow-500" />
          <span>Need ideas? Describe your domain's purpose:</span>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="e.g., gaming community, crypto trading, art portfolio..."
            value={domainDescription}
            onChange={(e) => setDomainDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoadingSuggestions && subdomain) {
                e.preventDefault();
                handleGetSuggestions();
              }
            }}
            className="flex-1 h-9 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleGetSuggestions}
            disabled={isLoadingSuggestions || !subdomain}
            className="gap-1.5"
          >
            {isLoadingSuggestions ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Generate
          </Button>
        </div>

        {/* Suggestions Display */}
        {promptSuggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Click to use {selectedSuggestionIndex !== null && "(click another to switch):"}
            </p>
            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
              {promptSuggestions.map((suggestion, idx) => {
                const isSelected = selectedSuggestionIndex === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(suggestion, idx)}
                    className={cn(
                      "text-xs px-3 py-2 rounded-md text-left transition-colors border relative",
                      isSelected
                        ? "bg-primary/20 border-primary text-primary-foreground ring-1 ring-primary"
                        : "bg-primary/10 hover:bg-primary/20 border-primary/20 hover:border-primary/40"
                    )}
                  >
                    {isSelected && (
                      <Check className="absolute top-1 right-1 h-4 w-4 p-0.5 rounded-full bg-primary text-primary-foreground" />
                    )}
                    {suggestion.length > 120
                      ? suggestion.slice(0, 120) + "..."
                      : suggestion}
                    <span className="text-[10px] text-muted-foreground/50 ml-2">
                      ({suggestion.length})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Prompt Input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">
            Describe Your NFT{" "}
            <span className="text-muted-foreground text-xs">(optional)</span>
          </label>
          <span
            className={cn(
              "text-xs",
              customPrompt.length > CUSTOM_PROMPT_MAX_LENGTH
                ? "text-red-500"
                : "text-muted-foreground"
            )}
          >
            {customPrompt.length}/{CUSTOM_PROMPT_MAX_LENGTH}
          </span>
        </div>
        <Textarea
          placeholder="bigfoot catching a fish by a mountain lake"
          value={customPrompt}
          onChange={(e) =>
            onPromptChange(e.target.value.slice(0, CUSTOM_PROMPT_MAX_LENGTH))
          }
          className="resize-none h-24"
          maxLength={CUSTOM_PROMPT_MAX_LENGTH}
        />
        {!customPrompt.trim() && (
          <InlineTip
            tip={`Leave empty to auto-generate art based on "${subdomain || "your subdomain"}"`}
          />
        )}
      </div>

      {/* Playground v2.5 Tips */}
      <PlaygroundTips defaultExpanded={false} />
    </div>
  );
}
