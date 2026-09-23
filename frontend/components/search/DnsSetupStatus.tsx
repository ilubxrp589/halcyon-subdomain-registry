"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, Loader2, AlertCircle, RefreshCw, Globe, Server, Radio } from "lucide-react";
import { getDnsStatus, type DnsStatus } from "@/services/api";

interface DnsSetupStatusProps {
  subdomain: string;
  tld: string;
}

const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLLS = 60; // Stop after 5 minutes

const STEPS = [
  { key: "registered", label: "Domain registered on blockchain", icon: CheckCircle },
  { key: "configuring", label: "Setting up DNS records", icon: Server },
  { key: "propagating", label: "DNS propagating to resolvers", icon: Radio },
  { key: "ready", label: "Domain is live", icon: Globe },
] as const;

function getCompletedSteps(status: DnsStatus["status"]): number {
  switch (status) {
    case "not_found": return 0;
    case "configuring": return 1;
    case "propagating": return 2;
    case "ready": return 4;
    default: return 0;
  }
}

export function DnsSetupStatus({ subdomain, tld }: DnsSetupStatusProps) {
  const [status, setStatus] = useState<DnsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const checkStatus = useCallback(async () => {
    try {
      const result = await getDnsStatus(subdomain, tld);
      setStatus(result);
      setError(null);
      return result.status === "ready";
    } catch {
      setError("Unable to check DNS status");
      return false;
    }
  }, [subdomain, tld]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let count = 0;

    const poll = async () => {
      if (cancelled) return;
      const done = await checkStatus();
      if (cancelled) return;

      count++;
      setPollCount(count);

      if (!done && count < MAX_POLLS) {
        timer = setTimeout(poll, POLL_INTERVAL);
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checkStatus, retryTrigger]);

  const handleRetry = () => {
    setIsRetrying(true);
    setPollCount(0);
    setRetryTrigger((prev) => prev + 1);
    setTimeout(() => setIsRetrying(false), 1000);
  };

  const completedSteps = status ? getCompletedSteps(status.status) : 1; // At least registered
  const isComplete = status?.status === "ready";
  const isTimedOut = pollCount >= MAX_POLLS && !isComplete;

  return (
    <div className="mt-6 bg-white/5 rounded-xl p-5 border border-white/10">
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <Globe className="h-4 w-4 text-[hsl(var(--halcyon-teal))]" />
        DNS Setup Progress
      </h3>

      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const isCompleted = i < completedSteps;
          const isCurrent = i === completedSteps && !isComplete;
          const StepIcon = step.icon;

          return (
            <div key={step.key} className="flex items-center gap-3">
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                isCompleted
                  ? "bg-green-500/20"
                  : isCurrent
                  ? "bg-[hsl(var(--halcyon-teal))]/20"
                  : "bg-white/5"
              }`}>
                {isCompleted ? (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 text-[hsl(var(--halcyon-teal))] animate-spin" />
                ) : (
                  <StepIcon className="h-3.5 w-3.5 text-white/30" />
                )}
              </div>
              <span className={`text-sm ${
                isCompleted
                  ? "text-green-400"
                  : isCurrent
                  ? "text-white"
                  : "text-white/40"
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))]"
          style={{ width: `${(completedSteps / STEPS.length) * 100}%` }}
        />
      </div>

      {/* Status message */}
      <div className="mt-3">
        {isComplete && (
          <p className="text-sm text-green-400">
            Your domain is live and resolving. You can manage DNS records from your dashboard.
          </p>
        )}
        {isTimedOut && !isComplete && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-sm text-amber-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>
                DNS setup is taking longer than usual. This can happen with new TLDs.
                Your domain will become active automatically — no action needed.
              </p>
            </div>
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="flex items-center gap-1.5 text-xs text-[hsl(var(--halcyon-teal))] hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
              Check again
            </button>
          </div>
        )}
        {!isComplete && !isTimedOut && (
          <p className="text-xs text-muted-foreground">
            This usually completes within a few seconds. You can close this and check your dashboard later.
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button
            onClick={handleRetry}
            className="text-xs underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default DnsSetupStatus;
