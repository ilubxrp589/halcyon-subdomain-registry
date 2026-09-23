"use client";

import { useState, useCallback, useEffect } from "react";
import { useWeb3ModalAccount, useWeb3ModalProvider } from "@/lib/web3modal";
import { BrowserProvider } from "ethers";
import api from "@/services/api";

const AUTH_STORAGE_KEY = "halcyon_auth_session";

// System wallets that should never be used for user authentication
// Set NEXT_PUBLIC_ALLOW_SYSTEM_WALLETS=true to bypass this check (for admin/testing)
const BLOCKED_WALLETS = process.env.NEXT_PUBLIC_ALLOW_SYSTEM_WALLETS === "true"
  ? []
  : [
      process.env.NEXT_PUBLIC_TREASURY_ADDRESS?.toLowerCase(),
      process.env.NEXT_PUBLIC_CONTRACT_ESCROW?.toLowerCase(),
    ].filter(Boolean) as string[];

interface AuthState {
  wallet: string | null;
  signature: string | null;
  nonce: string | null;
  expiresAt: Date | null;
}

interface StoredAuthState {
  wallet: string;
  signature: string;
  nonce: string;
  expiresAt: string; // ISO string for localStorage
}

interface NonceResponse {
  nonce: string;
  message: string;
  expiresAt: string;
}

/**
 * Load auth session from localStorage
 */
function loadStoredAuth(): AuthState | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;

    const parsed: StoredAuthState = JSON.parse(stored);
    const expiresAt = new Date(parsed.expiresAt);

    // Check if expired
    if (expiresAt <= new Date()) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    // Reject stored auth for blocked system wallets
    if (BLOCKED_WALLETS.includes(parsed.wallet.toLowerCase())) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return {
      wallet: parsed.wallet,
      signature: parsed.signature,
      nonce: parsed.nonce,
      expiresAt,
    };
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

/**
 * Save auth session to localStorage
 */
function saveAuthToStorage(state: AuthState): void {
  if (typeof window === "undefined") return;
  if (!state.wallet || !state.signature || !state.nonce || !state.expiresAt) return;

  const toStore: StoredAuthState = {
    wallet: state.wallet,
    signature: state.signature,
    nonce: state.nonce,
    expiresAt: state.expiresAt.toISOString(),
  };

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(toStore));
}

/**
 * Clear auth session from localStorage
 */
function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

/**
 * Hook for wallet signature authentication
 * Handles the nonce-signature flow for authenticated API requests
 * Sessions persist for 4 hours
 */
// Module-level lock to prevent concurrent auth requests
let pendingAuthPromise: Promise<AuthState> | null = null;

export function useAuth() {
  const { address, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();

  // Initialize state lazily from localStorage to avoid race condition
  const [authState, setAuthState] = useState<AuthState>(() => {
    const stored = loadStoredAuth();
    return stored || {
      wallet: null,
      signature: null,
      nonce: null,
      expiresAt: null,
    };
  });
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Re-check localStorage when address changes (for wallet switches)
  useEffect(() => {
    const stored = loadStoredAuth();
    if (stored && stored.wallet?.toLowerCase() === address?.toLowerCase()) {
      setAuthState(stored);
    } else if (authState.wallet && address && authState.wallet.toLowerCase() !== address.toLowerCase()) {
      // Wallet changed, clear auth
      clearStoredAuth();
      setAuthState({
        wallet: null,
        signature: null,
        nonce: null,
        expiresAt: null,
      });
    }
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Check if current auth is valid
   */
  const isAuthenticated = useCallback(() => {
    if (!authState.wallet || !authState.signature || !authState.nonce) {
      return false;
    }
    if (authState.wallet.toLowerCase() !== address?.toLowerCase()) {
      return false;
    }
    if (authState.expiresAt && new Date() >= authState.expiresAt) {
      return false;
    }
    return true;
  }, [authState, address]);

  /**
   * Get a nonce from the backend
   */
  const getNonce = useCallback(async (wallet: string): Promise<NonceResponse> => {
    const { data } = await api.get<NonceResponse>("/auth/nonce", {
      params: { wallet },
    });
    return data;
  }, []);

  /**
   * Sign a message with the connected wallet
   * Includes timeout to prevent indefinite hang when WalletConnect session is stale
   */
  const signMessage = useCallback(async (message: string): Promise<string> => {
    if (!walletProvider) {
      throw new Error("Wallet not connected");
    }

    const provider = new BrowserProvider(walletProvider);
    const signer = await provider.getSigner();

    // WalletConnect can hang forever if the session is stale — add a 60s timeout
    const signature = await Promise.race([
      signer.signMessage(message),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(
          "Signature request timed out. Please open your wallet app or reconnect your wallet."
        )), 60_000)
      ),
    ]);
    return signature;
  }, [walletProvider]);

  /**
   * Authenticate the connected wallet
   * Returns auth credentials for API requests
   * Uses module-level lock to prevent concurrent auth requests
   */
  const authenticate = useCallback(async (): Promise<AuthState> => {
    if (!isConnected || !address) {
      throw new Error("Wallet not connected");
    }

    // Prevent system wallets from being used for authentication
    if (BLOCKED_WALLETS.includes(address.toLowerCase())) {
      throw new Error("This wallet is reserved for system use. Please connect a different wallet.");
    }

    // If there's already a pending auth request for this wallet, return it
    // This MUST be synchronous check + return to prevent race conditions
    if (pendingAuthPromise) {
      return pendingAuthPromise;
    }

    setIsAuthenticating(true);
    setAuthError(null);

    // Create and set the promise SYNCHRONOUSLY before any async work
    const authPromise = (async (): Promise<AuthState> => {
      try {
        // Get nonce from backend
        const nonceData = await getNonce(address);

        // Sign the message
        const signature = await signMessage(nonceData.message);

        // Store auth state
        const newAuthState: AuthState = {
          wallet: address,
          signature,
          nonce: nonceData.nonce,
          expiresAt: new Date(nonceData.expiresAt),
        };

        setAuthState(newAuthState);
        saveAuthToStorage(newAuthState);
        return newAuthState;

      } catch (error) {
        const message = error instanceof Error ? error.message : "Authentication failed";
        setAuthError(message);
        throw error;
      } finally {
        setIsAuthenticating(false);
        pendingAuthPromise = null;
      }
    })();

    // Set lock IMMEDIATELY after creating promise (before any await)
    pendingAuthPromise = authPromise;
    return authPromise;
  }, [isConnected, address, getNonce, signMessage]);

  /**
   * Force refresh credentials (clear cache and re-authenticate)
   * Note: Don't clear React state before auth completes to avoid re-render chaos
   */
  const refreshCredentials = useCallback(async () => {
    // If there's already a pending auth, wait for it instead of starting another
    if (pendingAuthPromise) {
      const result = await pendingAuthPromise;
      if (result.wallet && result.signature && result.nonce) {
        return {
          wallet: result.wallet,
          signature: result.signature,
          nonce: result.nonce,
        };
      }
    }

    // Clear localStorage but NOT React state yet (to avoid re-render during auth)
    clearStoredAuth();

    // Authenticate will set new state when complete
    const newAuth = await authenticate();
    return {
      wallet: newAuth.wallet!,
      signature: newAuth.signature!,
      nonce: newAuth.nonce!,
    };
  }, [authenticate]);

  /**
   * Get current auth credentials or authenticate if needed
   * Reuses existing session if valid (4-hour window)
   */
  const getAuthCredentials = useCallback(async () => {
    // Reject blocked system wallets
    if (address && BLOCKED_WALLETS.includes(address.toLowerCase())) {
      throw new Error("This wallet is reserved for system use. Please connect a different wallet.");
    }

    // If there's a pending auth, wait for it instead of starting new one
    if (pendingAuthPromise) {
      const result = await pendingAuthPromise;
      if (result.wallet && result.signature && result.nonce) {
        return {
          wallet: result.wallet,
          signature: result.signature,
          nonce: result.nonce,
        };
      }
    }

    // Check React state first
    if (
      authState.wallet &&
      authState.signature &&
      authState.nonce &&
      authState.expiresAt &&
      authState.expiresAt > new Date() &&
      authState.wallet.toLowerCase() === address?.toLowerCase()
    ) {
      return {
        wallet: authState.wallet,
        signature: authState.signature,
        nonce: authState.nonce,
      };
    }

    // Also check localStorage directly (React state may not have hydrated yet)
    const stored = loadStoredAuth();
    if (
      stored &&
      stored.wallet &&
      stored.signature &&
      stored.nonce &&
      stored.expiresAt &&
      stored.expiresAt > new Date() &&
      stored.wallet.toLowerCase() === address?.toLowerCase()
    ) {
      // Update React state to match localStorage
      setAuthState(stored);
      return {
        wallet: stored.wallet,
        signature: stored.signature,
        nonce: stored.nonce,
      };
    }

    // Get fresh credentials
    const newAuth = await authenticate();
    return {
      wallet: newAuth.wallet!,
      signature: newAuth.signature!,
      nonce: newAuth.nonce!,
    };
  }, [authenticate, authState, address]);

  /**
   * Make an authenticated POST request
   */
  const authenticatedPost = useCallback(async <T>(
    url: string,
    data: Record<string, unknown> = {}
  ): Promise<T> => {
    const credentials = await getAuthCredentials();

    const { data: response } = await api.post<T>(url, {
      ...data,
      ...credentials,
    });

    // Session remains valid for 4 hours - no need to clear

    return response;
  }, [getAuthCredentials]);

  /**
   * Clear authentication state
   */
  const clearAuth = useCallback(() => {
    clearStoredAuth();
    setAuthState({
      wallet: null,
      signature: null,
      nonce: null,
      expiresAt: null,
    });
    setAuthError(null);
  }, []);

  return {
    // State
    isConnected,
    address,
    isAuthenticated: isAuthenticated(),
    isAuthenticating,
    authError,

    // Actions
    authenticate,
    getAuthCredentials,
    refreshCredentials,
    authenticatedPost,
    clearAuth,
  };
}

export default useAuth;
