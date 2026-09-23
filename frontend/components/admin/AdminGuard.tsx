"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldX, ShieldCheck, Wallet } from "lucide-react";

interface AdminGuardProps {
  children: React.ReactNode;
}

// Session storage key for admin verification
const ADMIN_VERIFIED_KEY = "halcyon_admin_verified";

export function AdminGuard({ children }: AdminGuardProps) {
  const router = useRouter();
  const {
    isConnected,
    address,
    isAdmin,
    verifyAdminStatus,
  } = useAdminAuth();

  const [verificationState, setVerificationState] = useState<"loading" | "verified" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  // Check if already verified this session
  const getSessionVerification = useCallback((walletAddress: string) => {
    if (typeof window === "undefined") return false;
    const stored = sessionStorage.getItem(ADMIN_VERIFIED_KEY);
    if (!stored) return false;
    try {
      const data = JSON.parse(stored);
      return data.wallet?.toLowerCase() === walletAddress.toLowerCase() && data.verified;
    } catch {
      return false;
    }
  }, []);

  // Mark as verified in session
  const setSessionVerified = useCallback((wallet: string) => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(ADMIN_VERIFIED_KEY, JSON.stringify({ wallet, verified: true }));
  }, []);

  // Main verification effect
  /* eslint-disable react-hooks/set-state-in-effect -- Intentional: manage verification state machine */
  useEffect(() => {
    // Not connected yet - show loading
    if (!isConnected || !address) {
      setVerificationState("loading");
      return;
    }

    // Check session storage first (instant)
    if (getSessionVerification(address)) {
      setVerificationState("verified");
      return;
    }

    // Need to verify with backend
    setVerificationState("loading");

    let cancelled = false;

    verifyAdminStatus()
      .then((isAdminResult) => {
        if (cancelled) return;

        if (isAdminResult) {
          setSessionVerified(address);
          setVerificationState("verified");
        } else {
          setVerificationState("failed");
          setError("Not authorized as admin");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setVerificationState("failed");
        setError(err instanceof Error ? err.message : "Verification failed");
      });

    return () => {
      cancelled = true;
    };
  }, [isConnected, address, getSessionVerification, verifyAdminStatus, setSessionVerified]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Handle manual verification retry
  const handleRetry = useCallback(async () => {
    if (!address) return;

    setVerificationState("loading");
    setError(null);

    try {
      const isAdminResult = await verifyAdminStatus();
      if (isAdminResult) {
        setSessionVerified(address);
        setVerificationState("verified");
      } else {
        setError("Not authorized as admin");
        setVerificationState("failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setVerificationState("failed");
    }
  }, [verifyAdminStatus, address, setSessionVerified]);

  // Not connected
  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription>
              Connect your admin wallet to access this area
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Use the wallet button in the header to connect
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading / Checking
  if (verificationState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
            <CardTitle>Checking Admin Access</CardTitle>
            <CardDescription>
              Verifying your wallet...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Verification failed
  if (verificationState === "failed") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-destructive/50">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <ShieldX className="w-6 h-6 text-destructive" />
            </div>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>{error || "Your wallet is not authorized for admin access"}</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm font-mono text-muted-foreground truncate">
              {address}
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={handleRetry}>
                Try Again
              </Button>
              <Button variant="outline" onClick={() => router.push("/")}>
                Return Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Admin verified - show children
  return (
    <div className="min-h-screen">
      <div className="bg-green-500/10 border-b border-green-500/30">
        <div className="container py-2 flex items-center justify-center gap-2 text-sm text-green-500">
          <ShieldCheck className="w-4 h-4" />
          <span>Admin Mode Active</span>
          <span className="font-mono text-xs opacity-70">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

export default AdminGuard;
