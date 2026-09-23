"use client";

import { ExternalLink, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { getExplorerTxUrl } from "@/lib/flareContracts";

interface TxStatusDisplayProps {
  hash: string;
  success: boolean;
  error?: string;
  chainId?: number;
  label?: string;
  onDismiss?: () => void;
}

export function TxStatusDisplay({
  hash,
  success,
  error,
  chainId,
  label,
  onDismiss,
}: TxStatusDisplayProps) {
  if (!hash && !error) return null;

  const explorerUrl = hash ? getExplorerTxUrl(chainId, hash) : "";

  return (
    <div
      className={`rounded-lg border p-4 ${
        success
          ? "border-green-500 bg-green-500/10"
          : "border-red-500 bg-red-500/10"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {success ? (
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          )}
          <div>
            <p className={`font-medium ${success ? "text-green-600" : "text-red-600"}`}>
              {success ? (label ?? "Transaction successful") : (label ?? "Transaction failed")}
            </p>
            {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
            {hash && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-500 hover:underline flex items-center gap-1 mt-1"
              >
                View on Explorer <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

/** Inline processing indicator */
export function TxProcessing({ message = "Confirm in wallet..." }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground py-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">{message}</span>
    </div>
  );
}
