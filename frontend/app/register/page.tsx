"use client";

import { useState, useEffect, useCallback } from "react";
import { useWeb3Modal, useWeb3ModalAccount, useWeb3ModalProvider, getPublicProvider } from "@/lib/web3modal";
import { BrowserProvider, Contract, parseEther, type Eip1193Provider } from "ethers";
import { Wallet, Loader2 } from "lucide-react";
import { cn, calculatePurchaseCredits } from "@/lib/utils";
import {
  searchSubdomain,
  completeRegistration,
  getTLDs,
  TLD,
} from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useShowcase } from "@/hooks/useShowcase";
import confetti from "canvas-confetti";

// Import new showcase components
import { ShowcaseGallery, BehindPanelMarquee } from "@/components/showcase";
import { GlassmorphicSearchPanel, ConfirmPurchaseModal } from "@/components/search";

// Import styles
import "./register.css";

// Contract ABI
const ESCROW_ABI = [
  "function purchaseSubdomain(string tld, string subdomain, string metadataURI) payable returns (uint256 escrowId, uint256 tokenId)",
  "function getCurrentPriceFLR(string memory subdomain) external view returns (uint256)",
  "event SubdomainPurchased(uint256 indexed escrowId, address indexed buyer, string tld, string subdomain, uint256 amountPaidFLR, uint256 priceUSD, uint256 tokenId)",
];

const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ESCROW || "";

const getCurrencySymbol = (chainId: number | undefined) => {
  return chainId === 14 ? "FLR" : "C2FLR";
};

interface SearchResult {
  available: boolean;
  subdomain: string;
  tld: string;
  fqdn: string;
  tier?: string;
  priceUSD?: number;
  priceFLR?: number;
  owner?: string;
  error?: string;
}

export default function RegisterPage() {
  const { open } = useWeb3Modal();
  const { address, isConnected, chainId } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  const { getAuthCredentials, isAuthenticating } = useAuth();

  // Showcase images for marquee gallery
  const { images: showcaseImages, isLoading: isLoadingShowcase, onCycleComplete } = useShowcase();

  // TLDs
  const [availableTLDs, setAvailableTLDs] = useState<TLD[]>([]);
  const [isLoadingTLDs, setIsLoadingTLDs] = useState(true);

  // Purchase modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState("");

  // Success state
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [creditsEarned, setCreditsEarned] = useState(0);

  const currencySymbol = getCurrencySymbol(chainId);

  // Fetch TLDs on mount
  useEffect(() => {
    const fetchTLDs = async () => {
      try {
        const tlds = await getTLDs();
        setAvailableTLDs(tlds);
      } catch (e) {
        console.error("Failed to fetch TLDs:", e);
        setAvailableTLDs([{ id: 1, name: "cryptofans", is_active: true, domain_count: 0 }]);
      } finally {
        setIsLoadingTLDs(false);
      }
    };

    fetchTLDs();
  }, []);

  // Handle register click from search panel
  const handleRegisterClick = useCallback((result: SearchResult) => {
    if (!result.available) return;
    setSelectedResult(result);
    setPurchaseError("");
    setIsModalOpen(true);
  }, []);

  // Handle purchase confirmation
  const handleConfirmPurchase = useCallback(async () => {
    if (!isConnected || !walletProvider || !selectedResult?.available) {
      throw new Error("Wallet not connected");
    }

    if (chainId !== 114 && chainId !== 14) {
      throw new Error("Please switch to Flare or Coston2 network");
    }

    if (!ESCROW_ADDRESS) {
      throw new Error("Contract not deployed. Please check configuration.");
    }

    setIsPurchasing(true);
    setPurchaseError("");

    try {
      // Get signer with retry — wallet RPCs are intermittently flaky
      let signer;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const provider = new BrowserProvider(walletProvider as Eip1193Provider, {
            chainId: 114,
            name: "coston2",
          });
          signer = await provider.getSigner();
          break;
        } catch (err) {
          if (attempt === 2) throw err;
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }

      // Use public RPC proxy for reads (more reliable than wallet's direct RPC)
      const readProvider = getPublicProvider();
      const readEscrow = new Contract(ESCROW_ADDRESS, ESCROW_ABI, readProvider);

      // Get price from contract via read provider
      const contractPriceFLR = await readEscrow.getCurrentPriceFLR(selectedResult.subdomain);
      const priceFLRWithBuffer = (contractPriceFLR * BigInt(1005)) / BigInt(1000);

      // Use placeholder metadataURI - backend will generate placeholder NFT on sync
      const placeholderURI = `placeholder:${selectedResult.fqdn.toLowerCase()}`;

      // Execute purchase transaction (needs signer)
      const escrow = new Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
      const tx = await escrow.purchaseSubdomain(
        selectedResult.tld,
        selectedResult.subdomain,
        placeholderURI,
        { value: priceFLRWithBuffer }
      );
      setTxHash(tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();

      // Parse event logs
      let parsedEscrowId = "";
      let parsedTokenId = "";

      if (receipt?.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = escrow.interface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            });
            if (parsed?.name === "SubdomainPurchased") {
              parsedEscrowId = parsed.args[0].toString();
              parsedTokenId = parsed.args[6].toString();
              break;
            }
          } catch {
            // Not our event
          }
        }
      }

      setTokenId(parsedTokenId);

      // Complete registration on backend
      try {
        const result = await completeRegistration({
          wallet: address!,
          escrowId: parsedEscrowId,
          tokenId: parsedTokenId,
          subdomain: selectedResult.subdomain,
          tld: selectedResult.tld,
          priceFLR: selectedResult.priceFLR,
          priceUSD: selectedResult.priceUSD,
        });

        // Track credits earned
        setCreditsEarned((result as { creditsAwarded?: number })?.creditsAwarded ?? calculatePurchaseCredits(1));
      } catch (authErr) {
        console.error("Backend registration completion failed:", authErr);
        setCreditsEarned(calculatePurchaseCredits(1));
      }

      // Success!
      setPurchaseSuccess(true);
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (err: unknown) {
      console.error("Purchase error:", err);
      let message = err instanceof Error ? err.message : "Transaction failed";
      // Friendlier message for RPC connectivity issues
      if (message.includes("could not coalesce") || message.includes("Failed to fetch") || message.includes("UNKNOWN_ERROR")) {
        message = "Network connection issue — please check your wallet is connected to Coston2 and try again.";
      }
      setPurchaseError(message);
      throw err;
    } finally {
      setIsPurchasing(false);
    }
  }, [isConnected, walletProvider, chainId, selectedResult, address]);

  // Handle modal close
  const handleModalClose = () => {
    if (isPurchasing) return;
    setIsModalOpen(false);
    if (purchaseSuccess) {
      // Reset for next purchase
      setPurchaseSuccess(false);
      setSelectedResult(null);
      setTxHash("");
      setTokenId("");
    }
  };

  // Loading state while TLDs load
  if (isLoadingTLDs) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="halcyon-bg" />
        <div className="text-center z-10">
          <Loader2 className="h-12 w-12 animate-spin text-halcyon-teal mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="register-page min-h-screen">
      {/* Halcyon Background */}
      <div className="halcyon-bg" />

      {/* Gradient Fade Edges */}
      <div className="gradient-fade-left" />
      <div className="gradient-fade-right" />

      {/* Main Content */}
      <div className="register-content">
        {/* Top Showcase Gallery */}
        <div className="register-gallery-top">
          {!isLoadingShowcase && showcaseImages.length > 0 && (
            <ShowcaseGallery
              images={showcaseImages}
              position="above"
              onCycleComplete={onCycleComplete}
            />
          )}
          {isLoadingShowcase && (
            <div className="h-[300px] flex items-center justify-center">
              <div className="flex gap-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-[220px] h-[220px] rounded-2xl showcase-skeleton"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Search Panel Area */}
        <div className="register-search-area">
          {/* Behind-panel marquee (z-index: 5) - hidden on mobile for performance */}
          <div className="hidden md:block">
            {!isLoadingShowcase && showcaseImages.length > 0 && (
              <BehindPanelMarquee images={showcaseImages} />
            )}
          </div>

          {/* Blur zone overlay (z-index: 6) */}
          <div className="behind-panel-blur-zone" />

          {/* Search panel (z-index: 20) */}
          <div className="w-full max-w-xl px-4 relative z-20">
            <GlassmorphicSearchPanel
              availableTLDs={availableTLDs}
              currencySymbol={currencySymbol}
              onRegisterClick={handleRegisterClick}
              walletAddress={isConnected ? address : undefined}
              getAuthCredentials={isConnected ? getAuthCredentials : undefined}
            />

            {/* Wallet Connection Hint */}
            {!isConnected && (
              <div className="wallet-hint mt-4">
                <Wallet className="h-6 w-6 mx-auto wallet-hint-icon mb-1.5" />
                <p className="text-sm text-muted-foreground mb-2">
                  Connect your wallet to register domains
                </p>
                <button
                  onClick={() => open()}
                  className="px-5 py-2 bg-gradient-to-r from-halcyon-teal to-halcyon-green text-white font-semibold rounded-lg hover:opacity-90 transition-all"
                >
                  Connect Wallet
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Showcase Gallery */}
        <div className="register-gallery-bottom">
          {!isLoadingShowcase && showcaseImages.length > 0 && (
            <ShowcaseGallery
              images={showcaseImages}
              position="below"
            />
          )}
        </div>
      </div>

      {/* Purchase Confirmation Modal */}
      {selectedResult && (
        <ConfirmPurchaseModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          searchResult={selectedResult}
          currencySymbol={currencySymbol}
          isConnected={isConnected}
          onConnectWallet={() => open()}
          onConfirmPurchase={handleConfirmPurchase}
        />
      )}
    </div>
  );
}
