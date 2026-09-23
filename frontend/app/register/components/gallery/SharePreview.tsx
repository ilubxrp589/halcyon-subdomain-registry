"use client";

import { useState } from "react";
import {
  Share2,
  Copy,
  Check,
  Download,
  Twitter,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HalcyonButton } from "../ui/AnimatedButton";
import { createSharePreview } from "@/services/api";
import { toast } from "sonner";

interface SharePreviewProps {
  imageBase64: string;
  imageCid?: string;
  domain: string;
  theme: string;
  model?: string;
  walletAddress?: string;
  generationId?: string;
  className?: string;
}

export function SharePreview({
  imageBase64,
  imageCid,
  domain,
  theme,
  model = "flux",
  walletAddress,
  generationId,
  className,
}: SharePreviewProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copying, setCopying] = useState(false);

  const createShareLink = async () => {
    // Need either an IPFS CID or generation ID to share
    if (!imageCid && !generationId) {
      toast.error("Image must be uploaded to IPFS before sharing");
      return;
    }

    setIsCreating(true);
    try {
      // Use the IPFS CID as the image hash for sharing
      const imageHash = imageCid || generationId || "";

      const result = await createSharePreview({
        imageHash,
        domain,
        model,
        themes: [theme],
        walletAddress: walletAddress || "",
      });

      if (result.success && result.shareUrl) {
        setShareUrl(result.shareUrl);
        toast.success("Share link created!");
      } else {
        throw new Error("Failed to create share link");
      }
    } catch (e) {
      console.error("Failed to create share link:", e);
      toast.error("Failed to create share link");
    } finally {
      setIsCreating(false);
    }
  };

  const copyToClipboard = async () => {
    if (shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopying(true);
        toast.success("Link copied to clipboard!");
        setTimeout(() => setCopying(false), 2000);
      } catch (e) {
        console.error("Failed to copy:", e);
        toast.error("Failed to copy link");
      }
    }
  };

  const downloadImage = () => {
    const link = document.createElement("a");
    // Handle both raw base64 and data URLs
    link.href = imageBase64.startsWith("data:") ? imageBase64 : `data:image/png;base64,${imageBase64}`;
    link.download = `${domain}-${theme}.png`;
    link.click();
  };

  const shareOnTwitter = () => {
    const text = encodeURIComponent(`Check out my ${domain} NFT on Halcyon! 🚀`);
    const url = encodeURIComponent(shareUrl || window.location.href);
    const hashtags = encodeURIComponent("Halcyon,NFT,FlareNetwork,HNS");
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${hashtags}`,
      "_blank"
    );
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {!shareUrl ? (
        <HalcyonButton
          variant="outline"
          size="sm"
          onClick={createShareLink}
          disabled={isCreating || (!imageCid && !generationId)}
          isLoading={isCreating}
        >
          <span className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </span>
        </HalcyonButton>
      ) : (
        <>
          <HalcyonButton
            variant="outline"
            size="sm"
            onClick={copyToClipboard}
          >
            {copying ? (
              <Check className="h-4 w-4 text-[hsl(var(--halcyon-green))]" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </HalcyonButton>

          <HalcyonButton
            variant="outline"
            size="sm"
            onClick={shareOnTwitter}
          >
            <Twitter className="h-4 w-4" />
          </HalcyonButton>

          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg border border-[hsl(var(--halcyon-teal))] text-[hsl(var(--halcyon-teal))] hover:bg-[hsl(var(--halcyon-teal))]/10 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </>
      )}

      <HalcyonButton
        variant="outline"
        size="sm"
        onClick={downloadImage}
      >
        <Download className="h-4 w-4" />
      </HalcyonButton>
    </div>
  );
}
