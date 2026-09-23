"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "./useAuth";
import { useWeb3ModalProvider } from "@/lib/web3modal";
import { BrowserProvider, Eip1193Provider } from "ethers";
import { verifyAdminSession } from "@/services/adminApi";

interface AdminAuthState {
  isAdmin: boolean;
  isVerifying: boolean;
  verificationError: string | null;
  lastVerified: Date | null;
}

interface ReadAuthCache {
  wallet: string;
  signature: string;
  timestamp: number;
  expiresAt: number;
}

// Cache duration for read auth (2 hours - sign once per session)
const READ_AUTH_CACHE_DURATION = 2 * 60 * 60 * 1000;

// Module-level cache for read auth signatures (shared across all hook instances)
let globalReadAuthCache: ReadAuthCache | null = null;

// SessionStorage key for persisting across page navigations
const SESSION_STORAGE_KEY = "halcyon_admin_auth_cache";

// Try to restore cache from sessionStorage on module load
if (typeof window !== "undefined") {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as ReadAuthCache;
      if (parsed.expiresAt > Date.now()) {
        globalReadAuthCache = parsed;
      } else {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore parse errors
  }
}

// Module-level cache for admin verification result
let globalAdminVerified: { wallet: string; isAdmin: boolean; expiresAt: number } | null = null;
const ADMIN_VERIFY_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Module-level promise to prevent concurrent signature requests (acts as a mutex)
let pendingSignatureRequest: Promise<ReadAuthCache> | null = null;

/**
 * Create the message for read-only admin auth (must match backend)
 */
function createReadAuthMessage(wallet: string, timestamp: number): string {
  return `Halcyon Admin Read Access

Wallet: ${wallet}
Timestamp: ${timestamp}

Sign this message to verify admin access for read-only operations.`;
}

/**
 * Module-level function to get or create read auth credentials
 * This can be called from anywhere in the hook
 */
async function getOrCreateReadAuthCredentials(
  walletAddress: string,
  walletProvider: unknown
): Promise<ReadAuthCache> {
  const now = Date.now();

  // Check if we have a valid cached signature
  if (
    globalReadAuthCache &&
    globalReadAuthCache.wallet.toLowerCase() === walletAddress.toLowerCase() &&
    globalReadAuthCache.expiresAt > now
  ) {
    return globalReadAuthCache;
  }

  // MUTEX: If no pending request exists, create one SYNCHRONOUSLY
  if (!pendingSignatureRequest) {
    pendingSignatureRequest = (async () => {
      try {
        const timestamp = Date.now();
        const message = createReadAuthMessage(walletAddress, timestamp);

        const provider = new BrowserProvider(walletProvider as Eip1193Provider);
        const signer = await provider.getSigner();
        const signature = await signer.signMessage(message);

        const cache: ReadAuthCache = {
          wallet: walletAddress,
          signature,
          timestamp,
          expiresAt: timestamp + READ_AUTH_CACHE_DURATION,
        };
        globalReadAuthCache = cache;

        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(cache));
        } catch {
          // Ignore storage errors
        }

        return cache;
      } finally {
        pendingSignatureRequest = null;
      }
    })();
  }

  return pendingSignatureRequest!;
}

/**
 * Hook for admin authentication
 * Extends useAuth with admin verification
 *
 * SECURITY: Admin status is ALWAYS verified by backend.
 * Frontend caching is only for UX optimization - all protected
 * operations require backend re-verification.
 */
export function useAdminAuth() {
  const auth = useAuth();
  const { walletProvider } = useWeb3ModalProvider();

  const [adminState, setAdminState] = useState<AdminAuthState>({
    isAdmin: false,
    isVerifying: false,
    verificationError: null,
    lastVerified: null,
  });

  /**
   * Check if we have a cached admin verification
   * This is only for UX - backend always re-verifies
   */
  const hasCachedAdminStatus = useCallback(() => {
    if (!auth.address || !globalAdminVerified) return false;
    return (
      globalAdminVerified.wallet.toLowerCase() === auth.address.toLowerCase() &&
      globalAdminVerified.expiresAt > Date.now()
    );
  }, [auth.address]);

  /**
   * Verify admin status with backend
   * This is the authoritative check - never trust client-side state
   */
  const verifyAdminStatus = useCallback(async (): Promise<boolean> => {
    if (!auth.isConnected || !auth.address) {
      setAdminState(prev => ({
        ...prev,
        isAdmin: false,
        verificationError: "Wallet not connected",
      }));
      return false;
    }

    // Check cache first (for UX only)
    if (hasCachedAdminStatus() && globalAdminVerified?.isAdmin) {
      setAdminState(prev => ({
        ...prev,
        isAdmin: true,
        isVerifying: false,
        verificationError: null,
      }));
      return true;
    }

    setAdminState(prev => ({ ...prev, isVerifying: true, verificationError: null }));

    try {
      // Use read auth credentials - same signature used for all admin operations
      // This avoids double signature prompts
      const readCreds = await getOrCreateReadAuthCredentials(auth.address, walletProvider);
      const result = await verifyAdminSession({
        wallet: readCreds.wallet,
        signature: readCreds.signature,
        timestamp: readCreds.timestamp,
      });

      // Cache the result for UX optimization
      globalAdminVerified = {
        wallet: auth.address,
        isAdmin: result.isAdmin,
        expiresAt: Date.now() + ADMIN_VERIFY_CACHE_DURATION,
      };

      setAdminState({
        isAdmin: result.isAdmin,
        isVerifying: false,
        verificationError: result.isAdmin ? null : "Not authorized as admin",
        lastVerified: new Date(),
      });

      return result.isAdmin;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Admin verification failed";

      // Clear cache on error
      globalAdminVerified = null;

      setAdminState({
        isAdmin: false,
        isVerifying: false,
        verificationError: message,
        lastVerified: null,
      });
      return false;
    }
  }, [auth.isConnected, auth.address, walletProvider, hasCachedAdminStatus]);

  /**
   * Get read-only auth credentials (with signature)
   * Uses cached signature if still valid, otherwise prompts for new signature
   * Uses mutex pattern to prevent concurrent signature requests
   */
  const getReadAuthCredentials = useCallback(async (): Promise<{
    wallet: string;
    signature: string;
    timestamp: number;
  }> => {
    if (!auth.address) {
      throw new Error("Wallet not connected");
    }

    if (!walletProvider) {
      throw new Error("Wallet provider not available");
    }

    const result = await getOrCreateReadAuthCredentials(auth.address, walletProvider);
    return {
      wallet: auth.address,
      signature: result.signature,
      timestamp: result.timestamp,
    };
  }, [auth.address, walletProvider]);

  /**
   * @deprecated Use getReadAuthCredentials instead
   * Get wallet-only credentials - now redirects to secure method
   */
  const getWalletOnly = useCallback(() => {
    // This now throws - callers should use getReadAuthCredentials
    throw new Error("getWalletOnly is deprecated. Use getReadAuthCredentials() instead.");
  }, []);

  /**
   * Get full auth credentials with admin check (for write operations)
   * Throws if not admin (verified by backend)
   */
  const getAdminCredentials = useCallback(async () => {
    const credentials = await auth.getAuthCredentials();
    // Backend will verify admin status on every write operation
    return credentials;
  }, [auth]);

  /**
   * Make an authenticated admin POST request
   */
  const adminPost = useCallback(async <T>(
    url: string,
    data: Record<string, unknown> = {}
  ): Promise<T> => {
    return auth.authenticatedPost<T>(url, data);
  }, [auth]);

  // Track previous address to detect actual changes (not just remounts)
  const prevAddressRef = useRef<string | undefined>(auth.address);

  // Reset admin state and clear cache ONLY when wallet actually changes
  useEffect(() => {
    // Only clear if address actually changed (not on initial mount or navigation)
    if (prevAddressRef.current !== auth.address) {
      setAdminState({
        isAdmin: false,
        isVerifying: false,
        verificationError: null,
        lastVerified: null,
      });
      // Clear global caches when wallet changes
      globalReadAuthCache = null;
      globalAdminVerified = null;
      prevAddressRef.current = auth.address;
    }
  }, [auth.address]);

  return {
    // From useAuth
    ...auth,

    // Admin-specific state
    isAdmin: adminState.isAdmin,
    isAdminWallet: adminState.isAdmin, // Now based on backend verification, not client-side check
    isVerifying: adminState.isVerifying,
    verificationError: adminState.verificationError,
    lastVerified: adminState.lastVerified,

    // Admin-specific actions
    verifyAdminStatus,
    getReadAuthCredentials, // For read-only operations (cached signature)
    getWalletOnly,          // @deprecated - throws error, use getReadAuthCredentials
    getAdminCredentials,    // For write operations (requires fresh signature)
    adminPost,
  };
}

export default useAdminAuth;
