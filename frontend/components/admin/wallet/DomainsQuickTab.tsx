"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Globe, Search, Loader2, CheckCircle2, XCircle, Plus, Trash2 } from "lucide-react";
import { getDNSRecords, getDnsStatus, type DnsStatus, type DNSRecord } from "@/services/api";

interface FlatDnsRecord {
  type: string;
  name: string;
  content: string;
  ttl: number;
}

export function DomainsQuickTab() {
  // Lookup state
  const [lookupFqdn, setLookupFqdn] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<DnsStatus | null>(null);
  const [lookupRecords, setLookupRecords] = useState<FlatDnsRecord[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const handleLookup = async () => {
    if (!lookupFqdn.includes(".")) {
      setLookupError("Enter a full domain name (e.g., wallet.cryptofans)");
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    setLookupStatus(null);
    setLookupRecords([]);

    const parts = lookupFqdn.split(".");
    const subdomain = parts[0];
    const tld = parts.slice(1).join(".");

    try {
      const [status, records] = await Promise.all([
        getDnsStatus(subdomain, tld).catch(() => null),
        getDNSRecords(subdomain, tld).catch(() => ({ records: [] as DNSRecord[] })),
      ]);
      setLookupStatus(status);
      // Flatten DNSRecord[] (which has nested records array) into flat display records
      const flat: FlatDnsRecord[] = (records.records || []).flatMap((r) =>
        r.records.map((entry) => ({
          type: r.type,
          name: r.name,
          content: entry.content,
          ttl: r.ttl,
        }))
      );
      setLookupRecords(flat);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLookupLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Domain Lookup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4" /> Domain Lookup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={lookupFqdn}
              onChange={(e) => setLookupFqdn(e.target.value.toLowerCase())}
              placeholder="wallet.cryptofans"
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              className="flex-1"
            />
            <Button onClick={handleLookup} disabled={lookupLoading || !lookupFqdn}>
              {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {lookupError && (
            <p className="text-sm text-red-500">{lookupError}</p>
          )}

          {lookupStatus && (
            <div className="p-3 rounded-lg border space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{lookupStatus.fqdn}</span>
                <Badge variant={lookupStatus.status === "ready" ? "outline" : "secondary"}
                  className={lookupStatus.status === "ready" ? "border-green-500 text-green-500" : ""}>
                  {lookupStatus.status}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-1">
                  {lookupStatus.dnsConfigured ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-500" />
                  )}
                  <span className="text-muted-foreground">DNS Configured</span>
                </div>
                <div className="flex items-center gap-1">
                  {lookupStatus.resolving ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-500" />
                  )}
                  <span className="text-muted-foreground">Resolving</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Records: {lookupStatus.recordCount ?? 0}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DNS Records */}
      {lookupRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4" /> DNS Records — {lookupFqdn}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lookupRecords.map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded border text-sm">
                  <Badge variant="outline" className="w-16 justify-center">{r.type}</Badge>
                  <span className="text-muted-foreground flex-1 font-mono text-xs truncate">{r.content}</span>
                  <span className="text-xs text-muted-foreground">TTL {r.ttl}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Help */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quick Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">Record Types</p>
              <ul className="space-y-0.5">
                <li><Badge variant="outline" className="text-xs mr-1">A</Badge> IPv4 address</li>
                <li><Badge variant="outline" className="text-xs mr-1">AAAA</Badge> IPv6 address</li>
                <li><Badge variant="outline" className="text-xs mr-1">CNAME</Badge> Alias to another domain</li>
                <li><Badge variant="outline" className="text-xs mr-1">TXT</Badge> Text data / verification</li>
                <li><Badge variant="outline" className="text-xs mr-1">MX</Badge> Mail server</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Resolution</p>
              <ul className="space-y-0.5">
                <li>DNS: BIND 9.20 via volume-resolver</li>
                <li>DoH: dns.halcyon-names.io/dns-query</li>
                <li>On-chain: HSRResolver contract</li>
                <li>Default TTL: 300 seconds</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
