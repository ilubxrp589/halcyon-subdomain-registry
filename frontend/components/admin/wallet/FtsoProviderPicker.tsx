"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, ChevronUp, Loader2, Users } from "lucide-react";
import { useFtsoProviders } from "@/hooks/useFtsoProviders";
import { bipsToPercent } from "@/hooks/useFlareDelegation";

interface FtsoProviderPickerProps {
  value: string;
  onChange: (address: string) => void;
  disabled?: boolean;
}

function truncateAddress(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function FtsoProviderPicker({ value, onChange, disabled }: FtsoProviderPickerProps) {
  const { providers, loading, search, setSearch } = useFtsoProviders();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <Label>FTSO Data Provider</Label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(false); }}
          placeholder="0x... or select from list"
          disabled={disabled}
          className="pr-10 font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          disabled={disabled}
        >
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {open && (
        <div className="border rounded-lg overflow-hidden bg-popover">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search providers..."
                className="pl-7 h-8 text-sm"
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading providers...
              </div>
            ) : providers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No providers found
              </div>
            ) : (
              providers.map((p) => (
                <button
                  key={p.address}
                  type="button"
                  onClick={() => {
                    onChange(p.address);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-accent transition-colors flex items-center justify-between ${
                    value === p.address ? "bg-accent" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <div>
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground ml-2 font-mono">
                        {truncateAddress(p.address)}
                      </span>
                    </div>
                  </div>
                  {p.fee > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {(p.fee / 100).toFixed(1)}% fee
                    </Badge>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
