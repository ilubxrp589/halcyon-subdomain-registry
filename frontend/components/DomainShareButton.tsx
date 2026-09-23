"use client";

import { useState } from "react";
import { Share2, Copy, Check, Twitter, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { shareDomain } from "@/services/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DomainShareButtonProps {
  domain: string;
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
}

export function DomainShareButton({
  domain,
  className,
  variant = "outline",
  size = "sm",
  showLabel = false,
}: DomainShareButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (shareUrl) {
      setIsOpen(true);
      return;
    }

    setIsLoading(true);
    try {
      const result = await shareDomain(domain);
      if (result.success && result.shareUrl) {
        setShareUrl(result.shareUrl);
        setIsOpen(true);
        toast.success("Share link created!");
      } else {
        throw new Error("Failed to create share link");
      }
    } catch (error) {
      console.error("Failed to create share link:", error);
      toast.error("Failed to create share link");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        toast.success("Link copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error("Failed to copy:", error);
        toast.error("Failed to copy link");
      }
    }
  };

  const shareOnTwitter = () => {
    const text = encodeURIComponent(`Check out my ${domain} NFT on Halcyon!`);
    const url = encodeURIComponent(shareUrl || "");
    const hashtags = encodeURIComponent("Halcyon,NFT,FlareNetwork,HNS");
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${hashtags}`,
      "_blank"
    );
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn(
          "hover:bg-primary/10 hover:border-primary/50",
          size === "sm" && !showLabel && "h-9 w-9 p-0",
          className
        )}
        onClick={handleShare}
        disabled={isLoading}
        title="Share Domain"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Share2 className="h-4 w-4" />
            {showLabel && <span className="ml-2">Share</span>}
          </>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share {domain}</DialogTitle>
          </DialogHeader>

          {shareUrl && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 bg-transparent text-sm font-mono truncate border-none outline-none"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 shrink-0"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={copyToClipboard}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={shareOnTwitter}
                >
                  <Twitter className="h-4 w-4 mr-2" />
                  Twitter
                </Button>
              </div>

              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Open share page
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
