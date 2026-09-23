"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface AmountInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxAmount?: string;
  symbol: string;
  disabled?: boolean;
  placeholder?: string;
}

export function AmountInput({
  label,
  value,
  onChange,
  maxAmount,
  symbol,
  disabled = false,
  placeholder = "0.0",
}: AmountInputProps) {
  const handleMax = () => {
    if (maxAmount) onChange(maxAmount);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {maxAmount && (
          <span className="text-xs text-muted-foreground">
            Available: {maxAmount} {symbol}
          </span>
        )}
      </div>
      <div className="relative">
        <Input
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            // Allow only valid decimal input
            const v = e.target.value;
            if (v === "" || /^\d*\.?\d*$/.test(v)) {
              onChange(v);
            }
          }}
          disabled={disabled}
          className="pr-24"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {maxAmount && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleMax}
              disabled={disabled}
            >
              MAX
            </Button>
          )}
          <span className="text-xs text-muted-foreground pr-2">{symbol}</span>
        </div>
      </div>
    </div>
  );
}
