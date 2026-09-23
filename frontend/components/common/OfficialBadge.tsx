"use client";

import { Badge } from "@/components/ui/badge";
import { Star, Globe } from "lucide-react";

interface OfficialBadgeProps {
  isOfficial: boolean;
  size?: "xs" | "sm" | "md";
}

export function OfficialBadge({ isOfficial, size = "sm" }: OfficialBadgeProps) {
  const iconSize = size === "xs" ? "w-2.5 h-2.5" : size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  const textClass = size === "xs" ? "text-[10px]" : "";

  if (isOfficial) {
    return (
      <Badge className={`bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1 ${textClass}`}>
        <Star className={iconSize} />
        <span>Halcyon Official</span>
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={`gap-1 ${textClass}`}>
      <Globe className={iconSize} />
      <span>Community</span>
    </Badge>
  );
}
