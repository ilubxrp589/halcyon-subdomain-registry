"use client";

import { useFlrPrice } from "@/hooks/useFlrPrice";
import { useCurrencySymbol } from "@/lib/web3modal";
import { cn } from "@/lib/utils";

interface PriceDisplayProps {
  /** Price in USD cents */
  usdCents: number;
  /** Show FLR amount with 2% slippage buffer */
  showSlippage?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Compact mode — single line */
  compact?: boolean;
}

export function PriceDisplay({
  usdCents,
  showSlippage = false,
  className,
  compact = false,
}: PriceDisplayProps) {
  const { rate, usdCentsToFlr, usdCentsToFlrWithBuffer, isStale, isLoading } =
    useFlrPrice();
  const symbol = useCurrencySymbol();

  const usdFormatted = (usdCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const flrAmount = usdCentsToFlr(usdCents);
  const flrWithBuffer = usdCentsToFlrWithBuffer(usdCents);

  const formatFlr = (amount: number | null) => {
    if (amount === null) return "...";
    if (amount >= 1000) return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (amount >= 1) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <span className="font-medium">{usdFormatted}</span>
        {flrAmount !== null && (
          <span className="text-muted-foreground">
            (~{formatFlr(flrAmount)} {symbol})
          </span>
        )}
        {isStale && (
          <span className="text-amber-500 text-xs" title="Price may be stale">
            *
          </span>
        )}
      </span>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold">{usdFormatted}</span>
        {flrAmount !== null && (
          <span className="text-sm text-muted-foreground">
            (~{formatFlr(flrAmount)} {symbol})
          </span>
        )}
        {isStale && !isLoading && (
          <span
            className="inline-block w-2 h-2 rounded-full bg-amber-500"
            title="Price data may be stale"
          />
        )}
      </div>
      {showSlippage && flrWithBuffer !== null && (
        <p className="text-xs text-muted-foreground">
          You&apos;ll send: {formatFlr(flrWithBuffer)} {symbol} (includes 2%
          buffer, excess refunded)
        </p>
      )}
    </div>
  );
}

export default PriceDisplay;
