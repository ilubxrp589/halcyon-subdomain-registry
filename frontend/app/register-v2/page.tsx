"use client";

import { useState, useCallback, useEffect, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BrowserProvider, Contract, keccak256, solidityPacked, randomBytes, hexlify, type Eip1193Provider } from "ethers";
import {
  useWeb3ModalAccount,
  useWeb3ModalProvider,
  useWeb3Modal,
  useCurrencySymbol,
  getPublicProvider,
} from "@/lib/web3modal";
import { useFlrPrice } from "@/hooks/useFlrPrice";
import { PriceDisplay } from "@/components/PriceDisplay";
import { toast } from "sonner";
import { Search, CheckCircle, XCircle, Wallet, Clock, Loader2 } from "lucide-react";
import { ShowcaseGallery } from "@/components/showcase";
import { useShowcase } from "@/hooks/useShowcase";
import { searchMultiTld, type MultiSearchResult, type BrowseFilter } from "@/services/tldBrowse";
import { MultiTldResults } from "@/components/search/MultiTldResults";
import "./register-v2.css";

// --- Constants ---

const API_V2 = `${process.env.NEXT_PUBLIC_API_URL || "/api/proxy"}/v2`;

const COMMIT_INTENT_ADDRESS = "0x1EB1BDF49deF1A32a56Abcce348342bb52c8A91d";
const COMMIT_INTENT_ABI = [
  "function commit(bytes32 commitHash) external",
  "function canReveal(bytes32 commitHash) external view returns (bool)",
  "event Committed(bytes32 indexed commitHash, address indexed sender, uint256 blockNumber)",
];

const REGISTRATION_MANAGER_ADDRESS = "0x9e680e851492F6135320FDaf64030F1F0Eb35D69";
const REGISTRATION_MANAGER_ABI = [
  "function registerWithCommit(string calldata label, bytes32 tldNamehash, uint256 durationYears, bytes32 secret) external payable",
  "event Registered(bytes32 indexed sldNamehash, bytes32 indexed tldNamehash, string label, address indexed buyer, uint256 tokenId, uint256 priceUsdCents, uint256 priceLockPerYear, uint256 durationYears)",
];

const FTSO_ORACLE_ADDRESS = "0x08d391c50AE8aa94B031195491Ffa9Df7953200c";
const FTSO_ORACLE_ABI = [
  "function usdCentsToFlr(uint256 usdCents) external view returns (uint256)",
];

const MIN_COMMIT_AGE = 8; // blocks
const STORAGE_KEY = "halcyon_commit_v2";

const STEP_LABELS = ["Search", "Configure", "Secure", "Register", "Done"];
const STEP_KEYS: Step[] = ["search", "configure", "commit", "register", "success"];
const YEAR_OPTIONS = [1, 2, 3, 5, 10];

// --- Types ---

type Step = "search" | "configure" | "commit" | "register" | "success";

interface TldOption {
  label: string;
  namehash: string;
  registrationEnabled: boolean;
}

interface SearchResult {
  fullName: string;
  tld: string;
  label: string;
  available: boolean;
  price: { usdCents: number; flr: number | null };
}

interface CommitData {
  secret: string;
  commitHash: string;
  label: string;
  tldNamehash: string;
  tld: string;
  address: string;
  blockNumber: number;
  timestamp: number;
}

// --- Helpers ---

function loadCommitFromStorage(label: string, tld: string, address: string): CommitData | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const data: CommitData = JSON.parse(stored);
    if (data.label === label && data.tld === tld && data.address.toLowerCase() === address.toLowerCase()) {
      // Check if commit is not older than 2 days
      if (Date.now() - data.timestamp < 2 * 24 * 60 * 60 * 1000) return data;
    }
  } catch { /* ignore */ }
  return null;
}

function saveCommitToStorage(data: CommitData) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearCommitStorage() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

// Get signer with retry — wallet RPCs are intermittently flaky
async function getSignerWithRetry(walletProvider: unknown, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const provider = new BrowserProvider(walletProvider as Eip1193Provider, {
        chainId: 114,
        name: "coston2",
      });
      return await provider.getSigner();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw new Error("Failed to connect to wallet after retries");
}

// --- Page ---

function RegisterV2Content() {
  const { address, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  const { open } = useWeb3Modal();
  const symbol = useCurrencySymbol();
  const { usdCentsToFlr } = useFlrPrice();
  const searchParams = useSearchParams();
  const urlTld = searchParams.get("tld") || "";

  // Showcase images for background grid
  const { images: showcaseImages, isLoading: isLoadingShowcase } = useShowcase(200);

  // Step state
  const [step, setStep] = useState<Step>("search");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTld, setSelectedTld] = useState<string>("");
  const [tlds, setTlds] = useState<TldOption[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  // Multi-TLD search state
  const [multiResults, setMultiResults] = useState<MultiSearchResult[]>([]);
  const [multiFilter, setMultiFilter] = useState<BrowseFilter>("all");
  const [isMultiSearching, setIsMultiSearching] = useState(false);
  const isMultiTldMode = !selectedTld;

  // Auto-suggest state
  const [suggestions, setSuggestions] = useState<{ subdomain: string; fqdn: string; available: boolean; tier: string; priceUSD: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Configure state
  const [years, setYears] = useState(1);
  const [priceQuote, setPriceQuote] = useState<{
    totalUsdCents: number;
    discountBps: number;
    finalUsdCents: number;
    flrAmount: number | null;
  } | null>(null);

  // Commit state
  const [commitData, setCommitData] = useState<CommitData | null>(null);
  const [blocksWaited, setBlocksWaited] = useState(0);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [canReveal, setCanReveal] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Success state
  const [registeredTokenId, setRegisteredTokenId] = useState<number | null>(null);

  // --- Fetch TLDs on mount ---

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_V2}/tlds`);
        if (!res.ok) {
          console.error(`[register-v2] TLD fetch failed: ${res.status} ${res.statusText}`);
          return;
        }
        const data = await res.json();
        const enabled = (data.tlds || [])
          .filter((t: TldOption) => t.registrationEnabled)
          .map((t: { label: string; namehash: string; registrationEnabled: boolean }) => ({
            label: t.label,
            namehash: t.namehash,
            registrationEnabled: t.registrationEnabled,
          }));
        setTlds(enabled);
        // If URL has ?tld=, pre-select it; otherwise leave empty for multi-TLD mode
        if (urlTld) {
          const match = enabled.find((t: TldOption) => t.label.toLowerCase() === urlTld.toLowerCase());
          if (match) {
            setSelectedTld(match.label);
          } else if (enabled.length > 0) {
            setSelectedTld(enabled[0].label);
          }
        }
        // If no urlTld param, selectedTld stays "" = multi-TLD mode
      } catch (err) {
        console.error("[register-v2] TLD fetch error:", err);
      }
    })();
  }, []);

  // --- Auto-suggest on typing ---

  useEffect(() => {
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);

    const q = searchQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    suggestDebounceRef.current = setTimeout(async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api/proxy";
        let items: typeof suggestions = [];

        if (selectedTld) {
          // Single-TLD mode: use V1 suggest endpoint
          const res = await fetch(`${apiBase}/search/suggest?q=${encodeURIComponent(q)}&tld=${encodeURIComponent(selectedTld)}`);
          if (!res.ok) return;
          const data = await res.json();
          items = data.suggestions || [];
        } else {
          // All-TLDs mode: use V2 multi-TLD search
          const res = await fetch(`${apiBase}/v2/search/multi?q=${encodeURIComponent(q)}&limit=6`);
          if (!res.ok) return;
          const data = await res.json();
          items = (data.results || []).map((r: MultiSearchResult) => ({
            subdomain: r.label,
            fqdn: r.fullName,
            available: r.available,
            tier: "",
            priceUSD: r.priceUsdCents ? r.priceUsdCents / 100 : 0,
          }));
        }

        setSuggestions(items);
        setShowSuggestions(items.length > 0);
      } catch {
        // Silently ignore suggest failures
      }
    }, 300);

    return () => {
      if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    };
  }, [searchQuery, selectedTld]);

  // --- Search ---

  const handleSearch = useCallback(async (overrideQuery?: string) => {
    const q = (overrideQuery ?? searchQuery).toLowerCase().trim();
    if (!q) return;
    setShowSuggestions(false);
    setSuggestions([]);

    if (isMultiTldMode) {
      // Multi-TLD search: search across all TLDs
      setIsMultiSearching(true);
      setMultiResults([]);
      try {
        const data = await searchMultiTld(q, multiFilter);
        setMultiResults(data.results || []);
      } catch {
        toast.error("Search failed. Please try again.");
      } finally {
        setIsMultiSearching(false);
      }
    } else {
      // Single-TLD search: existing behavior
      setIsSearching(true);
      setSearchResults([]);
      try {
        const tldParam = selectedTld ? `&tld=${selectedTld}` : "";
        const res = await fetch(`${API_V2}/search?q=${encodeURIComponent(q)}${tldParam}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch {
        toast.error("Search failed. Please try again.");
      } finally {
        setIsSearching(false);
      }
    }
  }, [searchQuery, selectedTld, isMultiTldMode, multiFilter]);

  // --- Select result and proceed ---

  const handleSelectResult = useCallback(
    (result: SearchResult) => {
      if (!result.available) return;
      setSelectedResult(result);
      setStep("configure");
    },
    []
  );

  // Handler for multi-TLD result selection: enters single-TLD flow
  const handleMultiSelect = useCallback(
    (result: MultiSearchResult) => {
      if (!result.available) return;
      // Set the TLD and create a SearchResult to enter the existing flow
      setSelectedTld(result.tld);
      const searchResult: SearchResult = {
        fullName: result.fullName,
        tld: result.tld,
        label: result.label,
        available: result.available,
        price: {
          usdCents: result.priceUsdCents ?? 0,
          flr: result.priceFlr,
        },
      };
      setSelectedResult(searchResult);
      setStep("configure");
    },
    []
  );

  // --- Fetch price quote ---

  useEffect(() => {
    if (step !== "configure" || !selectedResult) return;
    (async () => {
      try {
        const res = await fetch(
          `${API_V2}/price/${selectedResult.tld}/${selectedResult.label}/${years}`
        );
        const data = await res.json();
        if (data.reserved) {
          toast.error("This name is reserved.");
          setStep("search");
          return;
        }
        setPriceQuote({
          totalUsdCents: data.totalUsdCents,
          discountBps: data.discountBps,
          finalUsdCents: data.finalUsdCents,
          flrAmount: data.flrAmount,
        });
      } catch {
        toast.error("Failed to fetch price.");
      }
    })();
  }, [step, selectedResult, years]);

  // --- Commit ---

  const handleCommit = useCallback(async () => {
    if (!walletProvider || !address || !selectedResult) return;

    const tldInfo = tlds.find((t) => t.label === selectedResult.tld);
    if (!tldInfo) {
      toast.error("TLD info not found");
      return;
    }

    // Check for existing commit
    const existing = loadCommitFromStorage(selectedResult.label, selectedResult.tld, address);
    if (existing) {
      setCommitData(existing);
      setStep("commit");
      startBlockPoll(existing);
      return;
    }

    setIsCommitting(true);
    try {
      // Get signer with retry (wallet RPCs are intermittently flaky)
      let signer;
      try {
        signer = await getSignerWithRetry(walletProvider);
      } catch (signerErr) {
        console.error("[register-v2] getSigner failed:", signerErr);
        toast.error("Wallet RPC error — check that your wallet is connected to Coston2 and try again.");
        setIsCommitting(false);
        return;
      }

      // Generate secret
      const secretBytes = randomBytes(32);
      const secret = hexlify(secretBytes);

      // Compute commit hash
      const commitHash = keccak256(
        solidityPacked(
          ["string", "bytes32", "address", "bytes32"],
          [selectedResult.label, tldInfo.namehash, address, secret]
        )
      );

      // Pre-populate tx via our proxy to avoid CORS/429 on direct Coston2 RPC
      const proxyProvider = getPublicProvider();
      const readContract = new Contract(COMMIT_INTENT_ADDRESS, COMMIT_INTENT_ABI, proxyProvider);
      const txData = await readContract.commit.populateTransaction(commitHash);
      const [gasLimit, feeData, nonce] = await Promise.all([
        proxyProvider.estimateGas({ ...txData, from: address }),
        proxyProvider.getFeeData(),
        proxyProvider.getTransactionCount(address, "pending"),
      ]);

      toast.info("Confirm the commit transaction in your wallet...");
      const tx = await signer.sendTransaction({
        ...txData,
        gasLimit,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        nonce,
        chainId: BigInt(114),
      });
      toast.info("Transaction submitted — waiting for confirmation...");

      // Wait for receipt via proxy (wallet provider RPC can be flaky)
      let receipt;
      try {
        receipt = await Promise.race([
          proxyProvider.waitForTransaction(tx.hash, 1, 60_000),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("__TIMEOUT__")), 65_000)
          ),
        ]);
      } catch (waitErr) {
        if (waitErr instanceof Error && waitErr.message === "__TIMEOUT__") {
          toast.info("RPC slow — checking transaction status...");
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 5_000));
            receipt = await proxyProvider.getTransactionReceipt(tx.hash);
            if (receipt) break;
          }
          if (!receipt) throw new Error(`Transaction sent (${tx.hash}) but confirmation timed out. Check the explorer.`);
        } else {
          throw waitErr;
        }
      }
      if (!receipt || receipt.status === 0) throw new Error("Commit transaction reverted");

      const blockNumber = receipt.blockNumber;
      const data: CommitData = {
        secret,
        commitHash,
        label: selectedResult.label,
        tldNamehash: tldInfo.namehash,
        tld: selectedResult.tld,
        address,
        blockNumber,
        timestamp: Date.now(),
      };

      saveCommitToStorage(data);
      setCommitData(data);
      setStep("commit");
      startBlockPoll(data);
      toast.success("Commit submitted! Waiting for block confirmation...");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Commit failed";
      toast.error(msg);
    } finally {
      setIsCommitting(false);
    }
  }, [walletProvider, address, selectedResult, tlds]);

  // --- Block polling ---

  const startBlockPoll = useCallback(
    (data: CommitData) => {
      if (pollRef.current) clearInterval(pollRef.current);

      const checkBlocks = async () => {
        try {
          // Use public RPC proxy for read operations (avoids wallet RPC issues)
          const provider = getPublicProvider();
          const currentBlock = await provider.getBlockNumber();
          const waited = currentBlock - data.blockNumber;
          setBlocksWaited(waited);

          if (waited >= MIN_COMMIT_AGE) {
            // Double-check with contract
            const commitContract = new Contract(
              COMMIT_INTENT_ADDRESS,
              COMMIT_INTENT_ABI,
              provider
            );
            const ready = await commitContract.canReveal(data.commitHash);
            setCanReveal(ready);
            if (ready && pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        } catch { /* continue polling */ }
      };

      checkBlocks();
      pollRef.current = setInterval(checkBlocks, 10000);
    },
    []
  );

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // --- Register ---

  const handleRegister = useCallback(async () => {
    if (!walletProvider || !address) {
      toast.error("Please connect your wallet first.");
      setStep("commit");
      return;
    }
    if (!commitData) {
      toast.error("Commit data missing. Please start over.");
      setStep("search");
      return;
    }
    if (!priceQuote) {
      toast.error("Price quote expired. Fetching fresh quote...");
      setStep("configure");
      return;
    }

    setIsRegistering(true);
    setStep("register");
    try {
      // Get signer with retry (wallet RPCs are intermittently flaky)
      let signer;
      try {
        signer = await getSignerWithRetry(walletProvider);
      } catch (signerErr) {
        console.error("[register-v2] getSigner failed:", signerErr);
        toast.error("Wallet RPC error — check that your wallet is connected to Coston2 and try again.");
        setIsRegistering(false);
        setStep("commit");
        return;
      }
      // Get FLR amount from on-chain oracle via public RPC (read operation)
      const publicProvider = getPublicProvider();
      const oracle = new Contract(FTSO_ORACLE_ADDRESS, FTSO_ORACLE_ABI, publicProvider);
      const requiredFlr = await oracle.usdCentsToFlr(priceQuote.finalUsdCents);
      const flrWithBuffer = (requiredFlr * BigInt(102)) / BigInt(100); // 2% buffer

      // Pre-populate tx via proxy to avoid CORS/429 on direct Coston2 RPC
      const readRegManager = new Contract(
        REGISTRATION_MANAGER_ADDRESS,
        REGISTRATION_MANAGER_ABI,
        publicProvider
      );
      const txData = await readRegManager.registerWithCommit.populateTransaction(
        commitData.label,
        commitData.tldNamehash,
        years,
        commitData.secret,
      );
      const [feeData, nonce] = await Promise.all([
        publicProvider.getFeeData(),
        publicProvider.getTransactionCount(address, "pending"),
      ]);

      toast.info("Confirm the registration transaction in your wallet...");
      const tx = await signer.sendTransaction({
        ...txData,
        value: flrWithBuffer,
        gasLimit: BigInt(600000),
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        nonce,
        chainId: BigInt(114),
      });

      toast.info("Transaction submitted — waiting for confirmation...");

      // Wait for receipt via proxy (wallet provider RPC can be flaky)
      let receipt: Awaited<ReturnType<typeof tx.wait>>;
      try {
        receipt = await Promise.race([
          publicProvider.waitForTransaction(tx.hash, 1, 60_000),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("__TIMEOUT__")), 65_000)
          ),
        ]);
      } catch (waitErr: unknown) {
        if (waitErr instanceof Error && waitErr.message === "__TIMEOUT__") {
          // tx.wait timed out — poll manually with public RPC
          toast.info("RPC slow — checking transaction status...");
          let polled = null;
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 5_000));
            polled = await publicProvider.getTransactionReceipt(tx.hash);
            if (polled) break;
          }
          if (!polled) throw new Error(`Transaction sent (${tx.hash}) but confirmation timed out. Check the explorer.`);
          receipt = polled;
        } else {
          throw waitErr;
        }
      }
      if (!receipt || receipt.status === 0) throw new Error("Registration transaction reverted");

      // Parse Registered event for tokenId
      const registeredEvent = receipt.logs
        .map((log: { topics: readonly string[]; data: string }) => {
          try {
            return readRegManager.interface.parseLog({ topics: [...log.topics], data: log.data });
          } catch {
            return null;
          }
        })
        .find((e: { name: string } | null) => e?.name === "Registered");

      if (registeredEvent) {
        setRegisteredTokenId(Number(registeredEvent.args.tokenId));
      }

      clearCommitStorage();
      setStep("success");
      toast.success("Domain registered successfully!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      toast.error(msg);
      setStep("commit");
    } finally {
      setIsRegistering(false);
    }
  }, [walletProvider, address, commitData, priceQuote, years]);

  // --- Render ---

  const fullName = selectedResult
    ? `${selectedResult.label}.${selectedResult.tld}`
    : "";

  const currentStepIdx = STEP_KEYS.indexOf(step);

  // Split images across 3 rows — no overlap between rows
  const topImages = useMemo(() => showcaseImages.slice(0, 66), [showcaseImages]);
  const middleImages = useMemo(() => showcaseImages.slice(66, 133), [showcaseImages]);
  const bottomImages = useMemo(() => showcaseImages.slice(133, 200), [showcaseImages]);

  // Step indicator rendered inside each panel
  const stepIndicator = (
    <div className="v2-step-indicator">
      {STEP_LABELS.map((label, i) => (
        <div key={label} className="flex items-center">
          {i > 0 && (
            <div
              className={`v2-step-connector ${
                i <= currentStepIdx ? "v2-step-connector-active" : "v2-step-connector-pending"
              }`}
            />
          )}
          <div className="flex flex-col items-center gap-1">
            <div
              className={`v2-step-circle ${
                i === currentStepIdx
                  ? "v2-step-circle-active"
                  : i < currentStepIdx
                    ? "v2-step-circle-completed"
                    : "v2-step-circle-pending"
              }`}
            >
              {i < currentStepIdx ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                i + 1
              )}
            </div>
            <span className="text-[0.65rem] text-muted-foreground hidden sm:block">
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="register-page min-h-screen">
      {/* Halcyon Background */}
      <div className="halcyon-bg" />

      {/* 3 Rows of Fading Images — Fixed Background */}
      <div className="v2-image-bg">
        {!isLoadingShowcase && topImages.length > 0 && (
          <ShowcaseGallery images={topImages} position="above" />
        )}
        {!isLoadingShowcase && middleImages.length > 0 && (
          <ShowcaseGallery images={middleImages} position="both" />
        )}
        {!isLoadingShowcase && bottomImages.length > 0 && (
          <ShowcaseGallery images={bottomImages} position="below" />
        )}

        {/* Skeleton loading state */}
        {isLoadingShowcase && (
          <div className="flex flex-col justify-between flex-1 py-4">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex gap-2 justify-center">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="w-[240px] h-[240px] rounded-2xl showcase-skeleton flex-shrink-0" />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gradient Fade Edges */}
      <div className="gradient-fade-left" />
      <div className="gradient-fade-right" />


      {/* Floating Content Panel */}
      <div className="v2-content-overlay">
        <div className="w-full max-w-3xl px-4">
          {/* Connect wallet prompt */}
          {!isConnected && (
            <div className="v2-step-panel animate-fadeInUp">
              {stepIndicator}
              <div className="text-center">
                <Wallet className="h-8 w-8 mx-auto text-halcyon-teal mb-3" />
                <p className="text-muted-foreground mb-3">
                  Connect your wallet to register a domain
                </p>
                <button
                  onClick={() => open()}
                  className="btn-halcyon px-6 py-2.5 rounded-lg font-medium"
                >
                  Connect Wallet
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Search */}
          {isConnected && step === "search" && (
            <div className="glassmorphic-panel w-full max-w-3xl mx-auto animate-fadeInUp">
              <div className="bg-black border border-white/10 rounded-2xl shadow-2xl p-3 sm:p-5">
                {/* Header */}
                <div className="text-center mb-4">
                  <h1 className="text-2xl font-bold text-halcyon-gradient mb-1">
                    {isMultiTldMode ? "Search Across All TLDs" : "Find Your Name"}
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    {isMultiTldMode
                      ? "Find your perfect domain across all available TLDs"
                      : "Secure your unique NFT domain identity"}
                  </p>
                </div>

                {/* Search Form */}
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {/* Subdomain Input */}
                    <div className="flex-1 relative">
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                          setSearchQuery(val);
                          // Clear stale results when typing a new query
                          if (searchResults.length > 0) setSearchResults([]);
                          if (multiResults.length > 0) setMultiResults([]);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setShowSuggestions(false);
                            handleSearch();
                          }
                          if (e.key === "Escape") setShowSuggestions(false);
                        }}
                        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder="yourname"
                        className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-[hsl(var(--halcyon-teal))]/50 focus:ring-2 focus:ring-[hsl(var(--halcyon-teal))]/20 transition-all font-mono"
                        disabled={isSearching || isMultiSearching}
                      />

                      {/* Auto-suggest dropdown */}
                      {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-black/95 border border-white/10 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl">
                          {suggestions.slice(0, 6).map((s) => (
                            <button
                              key={s.fqdn}
                              type="button"
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 transition-colors text-left"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSearchQuery(s.subdomain);
                                setShowSuggestions(false);
                                setSuggestions([]);
                                handleSearch(s.subdomain);
                              }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-sm text-white truncate">{s.subdomain}</span>
                                <span className="text-xs text-white/40">.{s.fqdn.split(".").slice(1).join(".")}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {s.available ? (
                                  <span className="text-xs text-green-400">Available</span>
                                ) : (
                                  <span className="text-xs text-red-400">Taken</span>
                                )}
                                {s.available && s.priceUSD > 0 && (
                                  <span className="text-xs text-white/50">${s.priceUSD}</span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* TLD Selector */}
                    <select
                      value={selectedTld}
                      onChange={(e) => {
                        setSelectedTld(e.target.value);
                        setSearchResults([]);
                        setMultiResults([]);
                      }}
                      className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[hsl(var(--halcyon-teal))]/50 transition-all cursor-pointer"
                      disabled={isSearching || isMultiSearching}
                    >
                      <option value="" className="bg-gray-900">All TLDs</option>
                      {tlds.map((t) => (
                        <option key={t.label} value={t.label} className="bg-gray-900">.{t.label}</option>
                      ))}
                    </select>

                    {/* Search Button */}
                    <button
                      onClick={() => handleSearch()}
                      disabled={!searchQuery.trim() || isSearching || isMultiSearching}
                      className="px-5 py-2.5 bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      {(isSearching || isMultiSearching) ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Search className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Multi-TLD Results */}
                {isMultiTldMode && (multiResults.length > 0 || isMultiSearching) && (
                  <MultiTldResults
                    query={searchQuery}
                    results={multiResults}
                    isSearching={isMultiSearching}
                    onSelectResult={handleMultiSelect}
                    filter={multiFilter}
                    onFilterChange={setMultiFilter}
                  />
                )}

                {isMultiTldMode && multiResults.length === 0 && !isMultiSearching && searchQuery && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No results found. Try a different name.
                    </p>
                  </div>
                )}

                {/* Single-TLD Search Results */}
                {!isMultiTldMode && searchResults.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                    {searchResults.map((r) => (
                      <div
                        key={r.fullName}
                        onClick={() => r.available && handleSelectResult(r)}
                        className={`flex items-center justify-between gap-2 p-3 rounded-xl transition-all ${
                          r.available
                            ? "hover:bg-white/5 cursor-pointer"
                            : "opacity-50 cursor-default"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {r.available ? (
                            <div className="p-1.5 rounded-full bg-green-500/20">
                              <CheckCircle className="h-5 w-5 text-green-400" />
                            </div>
                          ) : (
                            <div className="p-1.5 rounded-full bg-red-500/20">
                              <XCircle className="h-5 w-5 text-red-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-mono font-bold text-white truncate">
                              {r.fullName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {r.available ? (
                                <span className="text-green-400">Available</span>
                              ) : (
                                <span className="text-red-400">Taken</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {r.available && r.price.usdCents > 0 && (
                            <div className="text-right">
                              <PriceDisplay usdCents={r.price.usdCents} compact />
                            </div>
                          )}
                          {r.available && (
                            <button className="px-4 py-1.5 bg-gradient-to-r from-[hsl(var(--halcyon-teal))] to-[hsl(var(--halcyon-green))] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all">
                              Register
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Switch to all TLDs link */}
                    <button
                      onClick={() => {
                        setSelectedTld("");
                        setSearchResults([]);
                      }}
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-colors"
                    >
                      Search across all TLDs instead
                    </button>
                  </div>
                )}

                {!isMultiTldMode && searchResults.length === 0 && !isSearching && searchQuery && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No results found. Try a different name.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Configure */}
          {isConnected && step === "configure" && selectedResult && (
            <div className="v2-step-panel v2-step-panel-active animate-fadeInUp space-y-5">
              {stepIndicator}

              <div className="text-center mb-1">
                <h2 className="text-lg font-semibold text-halcyon-gradient">Configure Registration</h2>
                <p className="text-sm text-muted-foreground">
                  Registering <strong className="text-foreground">{fullName}</strong>
                </p>
              </div>

              {/* Year Pills */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Registration Period</label>
                <div className="flex gap-2 justify-center">
                  {YEAR_OPTIONS.map((y) => (
                    <button
                      key={y}
                      onClick={() => setYears(y)}
                      className={`v2-year-pill ${years === y ? "v2-year-pill-active" : ""}`}
                    >
                      {y} yr{y > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price breakdown */}
              {priceQuote && (
                <div className="v2-price-box space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Base Price ({years} year{years > 1 ? "s" : ""})
                    </span>
                    <span>${(priceQuote.totalUsdCents / 100).toFixed(2)}</span>
                  </div>
                  {priceQuote.discountBps > 0 && (
                    <div className="flex items-center justify-between text-sm text-green-400">
                      <span>Multi-year Discount ({(priceQuote.discountBps / 100).toFixed(1)}%)</span>
                      <span>-${((priceQuote.totalUsdCents - priceQuote.finalUsdCents) / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-border/50 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Total</span>
                      <PriceDisplay usdCents={priceQuote.finalUsdCents} showSlippage compact />
                    </div>
                  </div>
                </div>
              )}

              {!priceQuote && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setStep("search");
                    setSelectedResult(null);
                    setPriceQuote(null);
                  }}
                  className="px-5 py-3 rounded-lg bg-muted/50 hover:bg-muted text-foreground font-medium border border-border/50 transition-all backdrop-blur-sm"
                >
                  Back
                </button>
                <button
                  onClick={handleCommit}
                  disabled={isCommitting || !priceQuote}
                  className="flex-1 btn-halcyon py-3 px-6 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCommitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </span>
                  ) : (
                    "Secure Name"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Commit waiting */}
          {isConnected && step === "commit" && (
            <div className="v2-step-panel v2-step-panel-active animate-fadeInUp space-y-5">
              {stepIndicator}

              <div className="text-center mb-1">
                <h2 className="text-lg font-semibold text-halcyon-gradient">Securing Your Name</h2>
                {fullName && (
                  <p className="text-sm font-medium text-foreground mt-1">{fullName}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Waiting for block confirmations to prevent frontrunning
                </p>
              </div>

              {/* Block progress */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Block Confirmations
                  </span>
                  <span className="font-mono text-lg">
                    {blocksWaited} / {MIN_COMMIT_AGE}
                  </span>
                </div>
                <div className={`v2-progress-bar ${!canReveal ? "v2-pulse-glow" : ""}`}>
                  <div
                    className="v2-progress-fill"
                    style={{
                      width: `${Math.min((blocksWaited / MIN_COMMIT_AGE) * 100, 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {canReveal
                    ? "Ready! You can now complete registration."
                    : `~${Math.max(0, (MIN_COMMIT_AGE - blocksWaited) * 2)} seconds remaining`}
                </p>
              </div>

              <button
                onClick={() => handleRegister()}
                disabled={!canReveal || isRegistering}
                className="w-full btn-halcyon py-3 px-6 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {!canReveal
                  ? "Waiting for confirmations..."
                  : isRegistering
                    ? "Registering..."
                    : "Complete Registration"}
              </button>
            </div>
          )}

          {/* Step 4: Registering */}
          {isConnected && step === "register" && (
            <div className="v2-step-panel v2-step-panel-active animate-fadeInUp space-y-4">
              {stepIndicator}
              <div className="text-center">
                <h2 className="text-lg font-semibold text-halcyon-gradient">Completing Registration</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Confirm the transaction in your wallet to register{" "}
                  <strong className="text-foreground">{fullName}</strong>
                </p>
              </div>
              <div className="flex justify-center py-6">
                <div className="w-14 h-14 border-4 border-[hsl(var(--halcyon-teal)/0.3)] border-t-[hsl(var(--halcyon-teal))] rounded-full animate-spin" />
              </div>
            </div>
          )}

          {/* Step 5: Success */}
          {step === "success" && (
            <div className="v2-step-panel animate-fadeInUp space-y-5">
              {stepIndicator}
              <div className="text-center">
                <div className="v2-success-check w-16 h-16 mx-auto mb-3 rounded-full bg-green-500/20 border-2 border-green-500/50 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-xl font-bold text-halcyon-gradient">Registration Complete!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  <strong className="text-foreground">{fullName}</strong> is now yours for {years} year
                  {years > 1 ? "s" : ""}.
                </p>
              </div>

              {registeredTokenId && (
                <div className="v2-price-box flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">NFT Token ID</span>
                  <span className="font-mono text-halcyon-teal">{registeredTokenId}</span>
                </div>
              )}

              <div className="v2-price-box text-sm text-muted-foreground">
                Your domain is live! Manage your DNS records and settings from the dashboard.
              </div>

              <div className="flex gap-3">
                <a
                  href="/dashboard"
                  className="flex-1 btn-halcyon py-3 px-6 rounded-lg font-medium text-center"
                >
                  Manage Domain
                </a>
                <a
                  href="/"
                  className="flex-1 py-3 px-6 rounded-lg bg-muted/50 hover:bg-muted text-foreground font-medium text-center border border-border/50 transition-all backdrop-blur-sm"
                >
                  Home
                </a>
              </div>

              <button
                onClick={() => {
                  setStep("search");
                  setSelectedResult(null);
                  setSearchQuery("");
                  setSearchResults([]);
                  setMultiResults([]);
                  setPriceQuote(null);
                  setCommitData(null);
                  setRegisteredTokenId(null);
                  if (!urlTld) setSelectedTld("");
                }}
                className="w-full py-2 text-sm text-halcyon-teal hover:text-halcyon-green transition-colors"
              >
                Register Another Domain
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RegisterV2Page() {
  return (
    <Suspense>
      <RegisterV2Content />
    </Suspense>
  );
}
