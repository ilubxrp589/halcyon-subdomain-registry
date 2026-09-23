"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ResolverStatus {
  status: "pending" | "propagated" | "error";
  ip: string | null;
  lastCheck: string;
  error?: string;
}

interface TldPropagation {
  resolvers: Record<string, ResolverStatus>;
  allPropagated: boolean;
}

interface WatcherStatus {
  isRunning: boolean;
  lastCheck: string | null;
  startedAt: string | null;
  elapsedTime: string | null;
  currentPhase: string | null;
  nextCheckIn: string | null;
  hnsNode: {
    connected: boolean;
    synced: boolean;
    height: number;
  } | null;
  nsPropagation: Record<string, TldPropagation>;
  dnsHealth: {
    pdnsApi: string;
    localResolution: string;
  } | null;
  propagationSummary: Record<string, {
    propagated: number;
    total: number;
    percentage: number;
    allPropagated: boolean;
  }>;
}

export function PropagationStatus() {
  const [status, setStatus] = useState<WatcherStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>("");

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/proxy/watcher");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (e) {
      setError("Unable to connect to backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!status?.nextCheckIn) return;

    const updateCountdown = () => {
      const next = new Date(status.nextCheckIn!).getTime();
      const now = Date.now();
      const diff = Math.max(0, next - now);

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCountdown(`${mins}m ${secs}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [status?.nextCheckIn]);

  if (loading) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">DNS Propagation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">DNS Propagation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-500">{error}</div>
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const allPropagated = Object.values(status.propagationSummary).every(s => s.allPropagated);

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              DNS Propagation
              {status.isRunning && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {allPropagated
                ? "All resolvers updated"
                : `Watching for NS propagation`}
            </CardDescription>
          </div>
          {allPropagated ? (
            <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
              Complete
            </Badge>
          ) : (
            <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">
              Propagating
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Phase & Timing */}
        {status.isRunning && !allPropagated && (
          <div className="text-sm text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Phase:</span>
              <span className="text-foreground">{status.currentPhase}</span>
            </div>
            <div className="flex justify-between">
              <span>Elapsed:</span>
              <span className="text-foreground">{status.elapsedTime}</span>
            </div>
            <div className="flex justify-between">
              <span>Next check:</span>
              <span className="text-foreground">{countdown}</span>
            </div>
          </div>
        )}

        {/* TLD Propagation Status */}
        {Object.entries(status.nsPropagation).map(([tld, data]) => {
          const summary = status.propagationSummary[tld];

          return (
            <div key={tld} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{tld}/</span>
                <span className="text-sm text-muted-foreground">
                  {summary.propagated}/{summary.total} resolvers
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    summary.allPropagated
                      ? 'bg-green-500'
                      : summary.percentage > 0
                        ? 'bg-yellow-500'
                        : 'bg-muted'
                  }`}
                  style={{ width: `${summary.percentage}%` }}
                />
              </div>

              {/* Resolver list */}
              <div className="grid gap-1 text-sm">
                {Object.entries(data.resolvers).map(([name, resolver]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between py-1 px-2 rounded bg-secondary/50"
                  >
                    <div className="flex items-center gap-2">
                      {resolver.status === "propagated" ? (
                        <span className="text-green-500">✓</span>
                      ) : resolver.status === "error" ? (
                        <span className="text-red-500">✗</span>
                      ) : (
                        <span className="text-muted-foreground">○</span>
                      )}
                      <span>{name}</span>
                    </div>
                    <span className={`text-xs ${
                      resolver.status === "propagated"
                        ? "text-green-500"
                        : resolver.status === "error"
                          ? "text-red-500"
                          : "text-muted-foreground"
                    }`}>
                      {resolver.status === "propagated"
                        ? resolver.ip
                        : resolver.status === "error"
                          ? "error"
                          : "pending"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* System Health */}
        {status.dnsHealth && (
          <div className="pt-2 border-t border-border/50">
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Local DNS:</span>
                <span className={status.dnsHealth.localResolution === "working" ? "text-green-500" : "text-red-500"}>
                  {status.dnsHealth.localResolution}
                </span>
              </div>
              <div className="flex justify-between">
                <span>HNS Node:</span>
                <span className={status.hnsNode?.synced ? "text-green-500" : "text-yellow-500"}>
                  {status.hnsNode?.synced ? `synced (${status.hnsNode.height})` : "syncing"}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
