"use client";

import { useState } from "react";
import {
  bulkListNames,
  type BulkListEntry,
} from "@/services/auctionHouseApi";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  X,
  Upload,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function BulkListDialog({
  open,
  onOpenChange,
  getAuthCredentials,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  getAuthCredentials: () => Promise<{ wallet: string; signature: string; nonce: string }>;
  onSuccess: () => void;
}) {
  const [csvText, setCsvText] = useState("");
  const [entries, setEntries] = useState<BulkListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ listed: number; failed: number; results: { name: string; success: boolean; error?: string }[] } | null>(null);

  const parseCsv = () => {
    const lines = csvText.trim().split("\n").filter(Boolean);
    const parsed: BulkListEntry[] = [];
    for (const line of lines) {
      const parts = line.split(",").map(s => s.trim());
      if (parts.length >= 2) {
        const name = parts[0].replace(/[^a-zA-Z0-9_-]/g, "");
        const price = parseFloat(parts[1]);
        if (name && price > 0) {
          parsed.push({ name, priceHns: price, description: parts[2] || undefined });
        }
      }
    }
    setEntries(parsed);
  };

  const handleSubmit = async () => {
    if (entries.length === 0) return;
    setLoading(true);
    setResult(null);
    try {
      const creds = await getAuthCredentials();
      const res = await bulkListNames(creds, entries);
      setResult({ listed: res.listed, failed: res.failed, results: res.results });
      if (res.listed > 0) {
        toast.success(`Listed ${res.listed} name${res.listed > 1 ? "s" : ""}`);
        onSuccess();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Bulk listing failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCsvText(ev.target?.result as string || "");
    };
    reader.readAsText(file);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-lg mx-4 rounded-2xl border border-halcyon-teal/20 bg-background/95 backdrop-blur-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Upload className="w-5 h-5 text-halcyon-teal" />
            Bulk List Names
          </h2>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Enter one name per line in CSV format: <code className="text-halcyon-teal">name,price,description</code>
        </p>

        <div className="flex items-center gap-2 mb-3">
          <label className="flex items-center gap-1 text-xs text-halcyon-teal cursor-pointer hover:underline">
            <Upload className="w-3 h-3" />
            Upload CSV
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        <textarea
          value={csvText}
          onChange={(e) => { setCsvText(e.target.value); setEntries([]); setResult(null); }}
          placeholder={"myname,100\ncoolname,250,Great domain\nanother,50"}
          rows={6}
          className="w-full rounded-lg bg-background/50 border border-halcyon-teal/15 p-3 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-halcyon-teal/30"
        />

        {entries.length === 0 && csvText.trim() && (
          <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={parseCsv}>
            Parse CSV ({csvText.trim().split("\n").filter(Boolean).length} lines)
          </Button>
        )}

        {entries.length > 0 && !result && (
          <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground mb-1">{entries.length} names ready to list:</p>
            {entries.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-background/30 border border-halcyon-teal/8">
                <span className="font-mono">{e.name}/</span>
                <span className="text-amber-400 font-semibold">{e.priceHns} HNS</span>
              </div>
            ))}
          </div>
        )}

        {result && (
          <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
            <p className="text-xs font-semibold mb-1">
              <span className="text-green-400">{result.listed} listed</span>
              {result.failed > 0 && <span className="text-red-400 ml-2">{result.failed} failed</span>}
            </p>
            {result.results.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-background/30">
                <span className="font-mono">{r.name}/</span>
                {r.success ? (
                  <CheckCircle className="w-3 h-3 text-green-400" />
                ) : (
                  <span className="text-red-400">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          {entries.length > 0 && !result && (
            <Button
              size="sm"
              className="btn-halcyon"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
              List {entries.length} Names
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
