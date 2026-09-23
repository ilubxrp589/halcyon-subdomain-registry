"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupName, updateDnsRecords } from "@/services/hnsWalletApi";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface DnsRecord {
  type: string;
  value: string;
  ttl: number;
}

interface DnsRecordEditorProps {
  name: string;
  getAuthCredentials: () => Promise<any>;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

const RECORD_TYPES = ["A", "AAAA", "CNAME", "TXT", "NS", "DS"];

function parseRecordsFromResource(records: any[]): DnsRecord[] {
  if (!records || !Array.isArray(records)) return [];
  const parsed: DnsRecord[] = [];
  for (const rec of records) {
    if (rec.type === "TXT" && rec.txt) {
      for (const t of rec.txt) {
        parsed.push({ type: "TXT", value: t, ttl: 300 });
      }
    } else if (rec.type === "A" && rec.address) {
      parsed.push({ type: "A", value: rec.address, ttl: 300 });
    } else if (rec.type === "AAAA" && rec.address) {
      parsed.push({ type: "AAAA", value: rec.address, ttl: 300 });
    } else if (rec.type === "CNAME" && rec.target) {
      parsed.push({ type: "CNAME", value: rec.target, ttl: 300 });
    } else if (rec.type === "NS" && rec.ns) {
      parsed.push({ type: "NS", value: rec.ns, ttl: 300 });
    } else if (rec.type === "DS") {
      parsed.push({
        type: "DS",
        value: `${rec.keyTag || ""} ${rec.algorithm || ""} ${rec.digestType || ""} ${rec.digest || ""}`,
        ttl: 300,
      });
    }
  }
  return parsed;
}

function buildHnsRecords(records: DnsRecord[]): unknown[] {
  return records
    .filter((r) => r.value.trim())
    .map((r) => {
      switch (r.type) {
        case "TXT":
          return { type: "TXT", txt: [r.value] };
        case "A":
          return { type: "A", address: r.value };
        case "AAAA":
          return { type: "AAAA", address: r.value };
        case "CNAME":
          return { type: "CNAME", target: r.value };
        case "NS":
          return { type: "NS", ns: r.value };
        case "DS": {
          const parts = r.value.trim().split(/\s+/);
          return {
            type: "DS",
            keyTag: parseInt(parts[0]) || 0,
            algorithm: parseInt(parts[1]) || 0,
            digestType: parseInt(parts[2]) || 0,
            digest: parts[3] || "",
          };
        }
        default:
          return { type: r.type, value: r.value };
      }
    });
}

export default function DnsRecordEditor({
  name,
  getAuthCredentials,
  onClose,
  onRefresh,
}: DnsRecordEditorProps) {
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadRecords() {
      try {
        const result = await lookupName(name);
        if (result.success && result.records) {
          const parsed = parseRecordsFromResource(result.records as any[]);
          setRecords(parsed.length > 0 ? parsed : [{ type: "A", value: "", ttl: 300 }]);
        } else {
          setRecords([{ type: "A", value: "", ttl: 300 }]);
        }
      } catch {
        setRecords([{ type: "A", value: "", ttl: 300 }]);
      } finally {
        setLoading(false);
      }
    }
    loadRecords();
  }, [name]);

  const addRecord = () => {
    setRecords((prev) => [...prev, { type: "A", value: "", ttl: 300 }]);
  };

  const removeRecord = (index: number) => {
    setRecords((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRecord = (index: number, field: keyof DnsRecord, value: string | number) => {
    setRecords((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const creds = await getAuthCredentials();
      if (!creds) return;
      const hnsRecords = buildHnsRecords(records);
      const res = await updateDnsRecords(creds, name, hnsRecords);
      if (res.success) {
        setSuccess(true);
        onRefresh();
        setTimeout(onClose, 1500);
      } else {
        setError(res.error || "Failed to update records");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
        <span className="ml-2 text-muted-foreground">Loading records...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Manage DNS records for <strong>{name}/</strong>. Changes are committed as a Handshake UPDATE transaction.
      </p>

      <div className="space-y-3">
        {records.map((rec, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={rec.type}
              onChange={(e) => updateRecord(i, "type", e.target.value)}
            >
              {RECORD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input
              className="flex-1"
              placeholder={
                rec.type === "A"
                  ? "1.2.3.4"
                  : rec.type === "AAAA"
                    ? "2001:db8::1"
                    : rec.type === "TXT"
                      ? "v=spf1 ..."
                      : rec.type === "NS"
                        ? "ns1.example.com."
                        : rec.type === "CNAME"
                          ? "target.example.com."
                          : "value"
              }
              value={rec.value}
              onChange={(e) => updateRecord(i, "value", e.target.value)}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRecord(i)}
              disabled={records.length <= 1}
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </Button>
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={addRecord}>
        <Plus className="w-3 h-3 mr-1" /> Add Record
      </Button>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-400 bg-green-500/10 border border-green-500/30 px-3 py-2 rounded">
          Records updated successfully!
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...
            </>
          ) : (
            "Save Records"
          )}
        </Button>
      </div>
    </div>
  );
}
