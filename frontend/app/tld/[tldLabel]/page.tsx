"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Contract, BrowserProvider, solidityPackedKeccak256, ZeroHash, formatEther } from "ethers";
import { useWeb3ModalAccount, useWeb3ModalProvider } from "@web3modal/ethers/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useFlrPrice } from "@/hooks/useFlrPrice";
import { PublicView } from "@/components/tld/PublicView";
import { RevenueChart } from "@/components/tld/RevenueChart";
import { getTldPublic } from "@/services/tldBrowse";
import type { TldPublicDetail } from "@/services/tldBrowse";
import { Settings, Eye } from "lucide-react";

const HSR_TLD_ADDRESS = "0xAEb64890BEBE39E5Fd845D95a81c818E9e039cdE";
const STRATEGY_ADDRESS = "0xa42B21dA24734C6f5e24876D0FCcDB1299bC97fE";
const PAYMENT_MANAGER_ADDRESS = "0xc502b38C93A3B34D5E0BcFD83384678632D0F112";

const HSR_TLD_ABI = [
  "function isRegistrationEnabled(bytes32 namehash) view returns (bool)",
  "function setRegistrationEnabled(bytes32 namehash, bool enabled)",
  "function ownerOfNamehash(bytes32 namehash) view returns (address)",
  "function getRegistrationStrategy(bytes32 namehash) view returns (address)",
  "function tokenIdToLabel(uint256 tokenId) view returns (string)",
];

const STRATEGY_ABI = [
  "function getLengthPrices(bytes32 tldNamehash) view returns (uint256[10])",
  "function setLengthPrices(bytes32 tldNamehash, uint256[10] prices)",
  "function getMultiYearDiscounts(bytes32 tldNamehash) view returns (uint256[10])",
  "function setMultiYearDiscounts(bytes32 tldNamehash, uint256[10] discounts)",
  "function setPremiumNames(bytes32 tldNamehash, string[] labels, uint256[] prices)",
  "function setReservedNames(bytes32 tldNamehash, string[] labels, address[] wallets)",
  "function getPremiumPrice(bytes32 tldNamehash, string label) view returns (uint256)",
  "function getReservedAddress(bytes32 tldNamehash, string label) view returns (address)",
  "function isConfigured(bytes32 namehash) view returns (bool)",
  "function getPriceInUsdCents(address buyer, bytes32 tldNamehash, string label, uint256 durationYears, bool isRenewal) view returns (uint256)",
];

const PAYMENT_ABI = [
  "function pendingWithdrawals(address account) view returns (uint256)",
  "function withdraw()",
  "function platformFeeBps() view returns (uint256)",
];

type OwnerTab = "overview" | "pricing" | "revenue";
type ViewMode = "public" | "manage";

interface OwnerData {
  owner: string;
  registrationEnabled: boolean;
  strategy: string;
  isConfigured: boolean;
}

const DEFAULT_PRICES = [50000, 25000, 10000, 500, 200, 100, 100, 100, 100, 100];
const DEFAULT_DISCOUNTS = [0, 500, 1000, 1500, 2000, 2500, 3000, 3000, 3000, 3000];
const LENGTH_LABELS = ["1 char", "2 chars", "3 chars", "4 chars", "5 chars", "6 chars", "7 chars", "8 chars", "9 chars", "10+ chars"];

function computeNamehash(label: string): string {
  const labelHash = solidityPackedKeccak256(["string"], [label.toLowerCase()]);
  return solidityPackedKeccak256(["bytes32", "bytes32"], [ZeroHash, labelHash]);
}

function formatUsdCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function TldDetailPage() {
  const params = useParams();
  const tldLabel = (params.tldLabel as string || "").toLowerCase();
  const namehash = computeNamehash(tldLabel);

  const { address, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  const { flrPerUsd, isStale } = useFlrPrice();

  // Public data — loads without wallet
  const [publicData, setPublicData] = useState<TldPublicDetail | null>(null);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publicError, setPublicError] = useState(false);

  // Owner state
  const [viewMode, setViewMode] = useState<ViewMode>("public");
  const [ownerTab, setOwnerTab] = useState<OwnerTab>("overview");
  const [isOwner, setIsOwner] = useState(false);
  const [ownerData, setOwnerData] = useState<OwnerData | null>(null);
  const [ownerLoading, setOwnerLoading] = useState(false);

  // Pricing state
  const [lengthPrices, setLengthPrices] = useState<number[]>([...DEFAULT_PRICES]);
  const [discounts, setDiscounts] = useState<number[]>([...DEFAULT_DISCOUNTS]);
  const [premiumLabel, setPremiumLabel] = useState("");
  const [premiumPrice, setPremiumPrice] = useState("");
  const [premiumList, setPremiumList] = useState<{ label: string; price: number }[]>([]);
  const [reservedLabel, setReservedLabel] = useState("");
  const [reservedWallet, setReservedWallet] = useState("");
  const [reservedList, setReservedList] = useState<{ label: string; wallet: string }[]>([]);

  // Revenue state
  const [pendingBalance, setPendingBalance] = useState<bigint>(BigInt(0));
  const [platformFeeBps, setPlatformFeeBps] = useState(500);

  // Action state
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [togglingReg, setTogglingReg] = useState(false);

  // Load public data (no wallet needed)
  useEffect(() => {
    if (!tldLabel) return;
    let cancelled = false;
    setPublicLoading(true);
    setPublicError(false);
    getTldPublic(tldLabel)
      .then((data) => { if (!cancelled) setPublicData(data); })
      .catch(() => { if (!cancelled) setPublicError(true); })
      .finally(() => { if (!cancelled) setPublicLoading(false); });
    return () => { cancelled = true; };
  }, [tldLabel]);

  // Load owner/on-chain data when wallet connects
  const loadOwnerData = useCallback(async () => {
    if (!walletProvider || !address) return;
    setOwnerLoading(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const tldContract = new Contract(HSR_TLD_ADDRESS, HSR_TLD_ABI, provider);
      const strategyContract = new Contract(STRATEGY_ADDRESS, STRATEGY_ABI, provider);
      const paymentContract = new Contract(PAYMENT_MANAGER_ADDRESS, PAYMENT_ABI, provider);

      const [owner, enabled, strategy, configured] = await Promise.all([
        tldContract.ownerOfNamehash(namehash).catch(() => "0x0000000000000000000000000000000000000000"),
        tldContract.isRegistrationEnabled(namehash).catch(() => false),
        tldContract.getRegistrationStrategy(namehash).catch(() => "0x0000000000000000000000000000000000000000"),
        strategyContract.isConfigured(namehash).catch(() => false),
      ]);

      const ownerIsUser = owner.toLowerCase() === address.toLowerCase();
      setIsOwner(ownerIsUser);
      setOwnerData({ owner, registrationEnabled: enabled, strategy, isConfigured: configured });

      if (ownerIsUser) {
        // Load pricing config if configured
        if (configured) {
          try {
            const [prices, multiDisc] = await Promise.all([
              strategyContract.getLengthPrices(namehash),
              strategyContract.getMultiYearDiscounts(namehash),
            ]);
            setLengthPrices(prices.map((p: bigint) => Number(p)));
            setDiscounts(multiDisc.map((d: bigint) => Number(d)));
          } catch (err) {
            console.error("Failed to load pricing:", err);
          }
        }

        // Load revenue data
        try {
          const [pending, feeBps] = await Promise.all([
            paymentContract.pendingWithdrawals(address),
            paymentContract.platformFeeBps(),
          ]);
          setPendingBalance(pending);
          setPlatformFeeBps(Number(feeBps));
        } catch (err) {
          console.error("Failed to load revenue:", err);
        }
      }
    } catch (err) {
      console.error("Failed to load owner data:", err);
    } finally {
      setOwnerLoading(false);
    }
  }, [walletProvider, address, namehash]);

  useEffect(() => {
    if (isConnected && walletProvider) {
      loadOwnerData();
    } else {
      setIsOwner(false);
      setOwnerData(null);
    }
  }, [isConnected, walletProvider, loadOwnerData]);

  // Owner actions
  const handleToggleRegistration = async () => {
    if (!walletProvider || !ownerData) return;
    setTogglingReg(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const tldContract = new Contract(HSR_TLD_ADDRESS, HSR_TLD_ABI, signer);
      const newState = !ownerData.registrationEnabled;
      const tx = await tldContract.setRegistrationEnabled(namehash, newState, {
        gasLimit: BigInt(100000),
      });
      toast.info("Transaction submitted...");
      await tx.wait();
      setOwnerData({ ...ownerData, registrationEnabled: newState });
      toast.success(`Registration ${newState ? "enabled" : "disabled"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle registration");
    } finally {
      setTogglingReg(false);
    }
  };

  const handleSavePricing = async () => {
    if (!walletProvider) return;
    setSaving(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const strategyContract = new Contract(STRATEGY_ADDRESS, STRATEGY_ABI, signer);
      const pricesArray = lengthPrices.map((p) => BigInt(p));
      const tx = await strategyContract.setLengthPrices(namehash, pricesArray, {
        gasLimit: BigInt(300000),
      });
      toast.info("Saving length prices...");
      await tx.wait();
      toast.success("Length prices saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save prices");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDiscounts = async () => {
    if (!walletProvider) return;
    setSaving(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const strategyContract = new Contract(STRATEGY_ADDRESS, STRATEGY_ABI, signer);
      const discArray = discounts.map((d) => BigInt(d));
      const tx = await strategyContract.setMultiYearDiscounts(namehash, discArray, {
        gasLimit: BigInt(300000),
      });
      toast.info("Saving discounts...");
      await tx.wait();
      toast.success("Multi-year discounts saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save discounts");
    } finally {
      setSaving(false);
    }
  };

  const handleAddPremium = async () => {
    if (!walletProvider || !premiumLabel || !premiumPrice) return;
    setSaving(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const strategyContract = new Contract(STRATEGY_ADDRESS, STRATEGY_ABI, signer);
      const priceCents = Math.round(parseFloat(premiumPrice) * 100);
      const tx = await strategyContract.setPremiumNames(
        namehash,
        [premiumLabel.toLowerCase()],
        [BigInt(priceCents)],
        { gasLimit: BigInt(200000) }
      );
      toast.info("Adding premium name...");
      await tx.wait();
      setPremiumList([...premiumList, { label: premiumLabel.toLowerCase(), price: priceCents }]);
      setPremiumLabel("");
      setPremiumPrice("");
      toast.success(`"${premiumLabel}" set as premium`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add premium name");
    } finally {
      setSaving(false);
    }
  };

  const handleAddReserved = async () => {
    if (!walletProvider || !reservedLabel || !reservedWallet) return;
    setSaving(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const strategyContract = new Contract(STRATEGY_ADDRESS, STRATEGY_ABI, signer);
      const tx = await strategyContract.setReservedNames(
        namehash,
        [reservedLabel.toLowerCase()],
        [reservedWallet],
        { gasLimit: BigInt(200000) }
      );
      toast.info("Reserving name...");
      await tx.wait();
      setReservedList([...reservedList, { label: reservedLabel.toLowerCase(), wallet: reservedWallet }]);
      setReservedLabel("");
      setReservedWallet("");
      toast.success(`"${reservedLabel}" reserved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reserve name");
    } finally {
      setSaving(false);
    }
  };

  const handleWithdraw = async () => {
    if (!walletProvider) return;
    setWithdrawing(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const paymentContract = new Contract(PAYMENT_MANAGER_ADDRESS, PAYMENT_ABI, signer);
      const tx = await paymentContract.withdraw({ gasLimit: BigInt(100000) });
      toast.info("Withdrawing...");
      await tx.wait();
      setPendingBalance(BigInt(0));
      toast.success("Withdrawal complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  };

  // Loading state
  if (publicLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading .{tldLabel}...</p>
        </div>
      </div>
    );
  }

  // TLD not found in API
  if (publicError || !publicData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-red-400">TLD Not Found</CardTitle>
            <CardDescription>
              .{tldLabel} is not available on this platform. You can{" "}
              <a href="/stake" className="text-amber-400 underline">stake it</a> if you own it on Handshake.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Public view mode
  if (viewMode === "public") {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Owner banner */}
          {isOwner && (
            <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
              <p className="text-sm text-amber-400">You own this TLD</p>
              <button
                onClick={() => setViewMode("manage")}
                className="flex items-center gap-2 px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-sm font-semibold rounded-lg transition-colors"
              >
                <Settings className="h-3.5 w-3.5" />
                Manage TLD
              </button>
            </div>
          )}

          <PublicView tld={publicData} />
        </div>
      </div>
    );
  }

  // Owner manage mode
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">.{tldLabel}</h1>
            <p className="text-muted-foreground">TLD Owner Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${ownerData?.registrationEnabled ? "bg-green-500" : "bg-red-500"}`} />
              <span className="text-sm text-muted-foreground">
                {ownerData?.registrationEnabled ? "Open" : "Closed"}
              </span>
            </div>
            <button
              onClick={() => setViewMode("public")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-white/10 rounded-lg transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              Public View
            </button>
          </div>
        </div>

        {ownerLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="animate-spin w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full" />
            Loading on-chain data...
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["overview", "pricing", "revenue"] as OwnerTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setOwnerTab(t)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors capitalize ${
                ownerTab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {ownerTab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Subdomains Registered</p>
                  <p className="text-3xl font-bold">{publicData.sldCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Pending Revenue</p>
                  <p className="text-3xl font-bold">{parseFloat(formatEther(pendingBalance)).toFixed(2)} FLR</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Platform Fee</p>
                  <p className="text-3xl font-bold">{(platformFeeBps / 100).toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">You keep {((10000 - platformFeeBps) / 100).toFixed(1)}%</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Registration Status</CardTitle>
                <CardDescription>
                  Control whether new subdomains can be registered under .{tldLabel}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {ownerData?.registrationEnabled ? "Registrations are open" : "Registrations are closed"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {ownerData?.registrationEnabled
                        ? "Users can register subdomains under your TLD"
                        : "No new registrations will be accepted"}
                    </p>
                  </div>
                  <button
                    onClick={handleToggleRegistration}
                    disabled={togglingReg}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      ownerData?.registrationEnabled
                        ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                        : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                    } disabled:opacity-50`}
                  >
                    {togglingReg ? "..." : ownerData?.registrationEnabled ? "Disable" : "Enable"}
                  </button>
                </div>
                {ownerData && !ownerData.registrationEnabled && (
                  <p className="mt-3 text-sm text-amber-400">
                    Warning: Existing subdomains remain active. Only new registrations are blocked.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>TLD Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Namehash</span>
                  <span className="font-mono text-xs">{namehash.slice(0, 10)}...{namehash.slice(-8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Owner</span>
                  <span className="font-mono text-xs">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Strategy</span>
                  <span className="font-mono text-xs">
                    {ownerData ? `${ownerData.strategy.slice(0, 6)}...${ownerData.strategy.slice(-4)}` : "..."}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pricing Configured</span>
                  <span className={ownerData?.isConfigured ? "text-green-400" : "text-amber-400"}>
                    {ownerData?.isConfigured ? "Yes" : "Not yet"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Pricing Tab */}
        {ownerTab === "pricing" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Length-Based Pricing</CardTitle>
                <CardDescription>Set annual price (USD) by subdomain character length</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {LENGTH_LABELS.map((label, i) => (
                    <div key={i} className="space-y-1">
                      <label className="text-xs text-muted-foreground">{label}</label>
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <input
                          type="number"
                          value={(lengthPrices[i] / 100).toFixed(0)}
                          onChange={(e) => {
                            const val = Math.round(parseFloat(e.target.value || "0") * 100);
                            const updated = [...lengthPrices];
                            updated[i] = val;
                            setLengthPrices(updated);
                          }}
                          className="w-full pl-6 pr-2 py-2 bg-muted rounded-md text-sm text-right"
                          min="0"
                        />
                      </div>
                      {flrPerUsd != null && flrPerUsd > 0 && (
                        <p className="text-xs text-muted-foreground text-right">
                          ~{Math.round(lengthPrices[i] / 100 * flrPerUsd)} FLR
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleSavePricing}
                  disabled={saving}
                  className="mt-4 w-full py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Length Prices"}
                </button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Multi-Year Discounts</CardTitle>
                <CardDescription>Discount in basis points (100 = 1%). Applied per registration year count.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {discounts.map((d, i) => (
                    <div key={i} className="space-y-1">
                      <label className="text-xs text-muted-foreground">{i + 1} year{i > 0 ? "s" : ""}</label>
                      <div className="relative">
                        <input
                          type="number"
                          value={d}
                          onChange={(e) => {
                            const val = parseInt(e.target.value || "0", 10);
                            const updated = [...discounts];
                            updated[i] = Math.min(val, 5000);
                            setDiscounts(updated);
                          }}
                          className="w-full px-2 py-2 bg-muted rounded-md text-sm text-right"
                          min="0"
                          max="5000"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">bps</span>
                      </div>
                      <p className="text-xs text-muted-foreground text-right">{(d / 100).toFixed(1)}% off</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleSaveDiscounts}
                  disabled={saving}
                  className="mt-4 w-full py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Discounts"}
                </button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Premium Names</CardTitle>
                <CardDescription>Override pricing for specific labels (e.g., &quot;crypto&quot; = $500/yr)</CardDescription>
              </CardHeader>
              <CardContent>
                {premiumList.length > 0 && (
                  <div className="mb-4 space-y-1">
                    {premiumList.map((p) => (
                      <div key={p.label} className="flex justify-between items-center bg-muted rounded-md px-3 py-2 text-sm">
                        <span className="font-mono">{p.label}.{tldLabel}</span>
                        <span>{formatUsdCents(p.price)}/yr</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={premiumLabel}
                    onChange={(e) => setPremiumLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="Label (e.g., crypto)"
                    className="flex-1 px-3 py-2 bg-muted rounded-md text-sm"
                  />
                  <div className="relative w-32">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <input
                      type="number"
                      value={premiumPrice}
                      onChange={(e) => setPremiumPrice(e.target.value)}
                      placeholder="USD/yr"
                      className="w-full pl-6 pr-2 py-2 bg-muted rounded-md text-sm"
                      min="0"
                    />
                  </div>
                  <button
                    onClick={handleAddPremium}
                    disabled={saving || !premiumLabel || !premiumPrice}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-md text-sm transition-colors disabled:opacity-50"
                  >
                    {saving ? "..." : "Add"}
                  </button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reserved Names</CardTitle>
                <CardDescription>Reserve labels for specific wallets (only that wallet can register)</CardDescription>
              </CardHeader>
              <CardContent>
                {reservedList.length > 0 && (
                  <div className="mb-4 space-y-1">
                    {reservedList.map((r) => (
                      <div key={r.label} className="flex justify-between items-center bg-muted rounded-md px-3 py-2 text-sm">
                        <span className="font-mono">{r.label}.{tldLabel}</span>
                        <span className="font-mono text-xs">{r.wallet.slice(0, 6)}...{r.wallet.slice(-4)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      value={reservedLabel}
                      onChange={(e) => setReservedLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="Label (e.g., admin)"
                      className="flex-1 px-3 py-2 bg-muted rounded-md text-sm"
                    />
                    <input
                      value={reservedWallet}
                      onChange={(e) => setReservedWallet(e.target.value)}
                      placeholder="0x... wallet address"
                      className="flex-[2] px-3 py-2 bg-muted rounded-md text-sm font-mono"
                    />
                    <button
                      onClick={handleAddReserved}
                      disabled={saving || !reservedLabel || !reservedWallet}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-md text-sm transition-colors disabled:opacity-50"
                    >
                      {saving ? "..." : "Add"}
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Revenue Tab */}
        {ownerTab === "revenue" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Available to Withdraw</p>
                  <p className="text-3xl font-bold">{parseFloat(formatEther(pendingBalance)).toFixed(4)} FLR</p>
                  {flrPerUsd != null && flrPerUsd > 0 && pendingBalance > BigInt(0) && (
                    <p className="text-sm text-muted-foreground">
                      ~${(parseFloat(formatEther(pendingBalance)) / flrPerUsd).toFixed(2)} USD
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground">Your Revenue Share</p>
                  <p className="text-3xl font-bold">{((10000 - platformFeeBps) / 100).toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">Platform takes {(platformFeeBps / 100).toFixed(1)}%</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Withdraw Earnings</CardTitle>
                <CardDescription>
                  Revenue from subdomain registrations accumulates in the PaymentManager contract.
                  Withdraw your share at any time.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingBalance > BigInt(0) ? (
                  <div className="space-y-4">
                    <div className="bg-muted rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Amount</span>
                        <span className="text-lg font-bold">{parseFloat(formatEther(pendingBalance)).toFixed(4)} FLR</span>
                      </div>
                    </div>
                    <button
                      onClick={handleWithdraw}
                      disabled={withdrawing}
                      className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {withdrawing ? "Withdrawing..." : "Withdraw"}
                    </button>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">
                    No pending withdrawals. Revenue will appear here as users register subdomains.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Revenue Chart */}
            <RevenueChart tldLabel={tldLabel} />

            <Card>
              <CardHeader>
                <CardTitle>How Revenue Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>When a user registers a subdomain under .{tldLabel}:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>They pay the registration fee in FLR (converted from USD via FTSO oracle)</li>
                  <li>The PaymentManager contract splits the payment</li>
                  <li>Your share ({((10000 - platformFeeBps) / 100).toFixed(1)}%) accumulates as pending withdrawals</li>
                  <li>You can withdraw at any time using the button above</li>
                </ol>
                <p className="mt-2">
                  {isStale && <span className="text-amber-400">(Price data may be stale) </span>}
                  Current FLR price: {flrPerUsd != null && flrPerUsd > 0 ? `1 USD = ${flrPerUsd.toFixed(2)} FLR` : "Loading..."}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
