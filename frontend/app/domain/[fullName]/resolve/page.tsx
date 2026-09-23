"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Contract,
  BrowserProvider,
  solidityPackedKeccak256,
  ZeroHash,
  getAddress,
  hexlify,
  toUtf8Bytes,
  toUtf8String,
  getBytes,
  isBytesLike,
} from "ethers";
import { useWeb3ModalAccount, useWeb3ModalProvider } from "@web3modal/ethers/react";
import { useWeb3Modal } from "@web3modal/ethers/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const DEFAULT_RESOLVER_ADDRESS = "0xbE845B15524C31dAAe30b3C1004388BAEBE5Bc2F";
const HSR_SLD_ADDRESS = "0xA94F9BB2877e969b63e78c148fdc66A61E415110";

const RESOLVER_ABI = [
  "function setAddr(bytes32 node, address wallet)",
  "function setAddr(bytes32 node, uint256 coinType, bytes addr)",
  "function setText(bytes32 node, string key, string value)",
  "function setContenthash(bytes32 node, bytes hash)",
  "function setName(bytes32 node, string name)",
  "function addr(bytes32 node) view returns (address)",
  "function addr(bytes32 node, uint256 coinType) view returns (bytes)",
  "function text(bytes32 node, string key) view returns (string)",
  "function contenthash(bytes32 node) view returns (bytes)",
  "function name(bytes32 node) view returns (string)",
  "function multicall(bytes[] data) returns (bytes[])",
];

const SLD_ABI = [
  "function sldNamehashToTokenId(bytes32 sldNamehash) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getSldData(uint256 tokenId) view returns (bytes32, string, uint256, uint256, uint256, string, bool)",
  "function getExpiryTime(bytes32 sldNamehash) view returns (uint256)",
];

// Coin types per SLIP-44
const COINTYPE_FLR = BigInt("0x8000000E");
const COINTYPE_ETH = BigInt(60);
const COINTYPE_BTC = BigInt(0);

type Tab = "addresses" | "profile" | "website" | "primary";

interface AddressRecord {
  label: string;
  coinType: bigint;
  value: string;
  original: string;
}

interface TextRecord {
  key: string;
  label: string;
  placeholder: string;
  value: string;
  original: string;
}

const TEXT_RECORD_DEFS: Omit<TextRecord, "value" | "original">[] = [
  { key: "avatar", label: "Avatar URL", placeholder: "https://example.com/avatar.png" },
  { key: "url", label: "Website", placeholder: "https://yoursite.com" },
  { key: "description", label: "Description", placeholder: "A short bio or description" },
  { key: "com.twitter", label: "Twitter / X", placeholder: "@username" },
  { key: "com.github", label: "GitHub", placeholder: "username" },
  { key: "com.discord", label: "Discord", placeholder: "username#0000" },
  { key: "org.telegram", label: "Telegram", placeholder: "@username" },
  { key: "email", label: "Email", placeholder: "name@example.com" },
];

function computeTldNamehash(tld: string): string {
  const labelHash = solidityPackedKeccak256(["string"], [tld.toLowerCase()]);
  return solidityPackedKeccak256(["bytes32", "bytes32"], [ZeroHash, labelHash]);
}

function computeSldNamehash(label: string, tld: string): string {
  const parentNamehash = computeTldNamehash(tld);
  const sldLabelHash = solidityPackedKeccak256(["string"], [label.toLowerCase()]);
  return solidityPackedKeccak256(["bytes32", "bytes32"], [parentNamehash, sldLabelHash]);
}

export default function ResolverManagementPage() {
  const params = useParams();
  const fullName = decodeURIComponent(params.fullName as string || "");

  const parts = fullName.split(".");
  const sldLabel = parts[0] || "";
  const tldLabel = parts.slice(1).join(".") || "";
  const sldNamehash = sldLabel && tldLabel ? computeSldNamehash(sldLabel, tldLabel) : ZeroHash;

  const { address, isConnected } = useWeb3ModalAccount();
  const { walletProvider } = useWeb3ModalProvider();
  const { open } = useWeb3Modal();

  const [tab, setTab] = useState<Tab>("addresses");
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [sldOwner, setSldOwner] = useState("");
  const [saving, setSaving] = useState(false);

  // Address records
  const [addresses, setAddresses] = useState<AddressRecord[]>([
    { label: "FLR Address", coinType: COINTYPE_FLR, value: "", original: "" },
    { label: "ETH Address", coinType: COINTYPE_ETH, value: "", original: "" },
    { label: "BTC Address", coinType: COINTYPE_BTC, value: "", original: "" },
  ]);

  // Text records
  const [textRecords, setTextRecords] = useState<TextRecord[]>(
    TEXT_RECORD_DEFS.map((d) => ({ ...d, value: "", original: "" }))
  );

  // Content hash
  const [contentHash, setContentHash] = useState("");
  const [originalContentHash, setOriginalContentHash] = useState("");

  // Primary name
  const [primaryName, setPrimaryName] = useState("");
  const [originalPrimaryName, setOriginalPrimaryName] = useState("");

  const loadRecords = useCallback(async () => {
    if (!walletProvider || !address || sldNamehash === ZeroHash) return;
    setLoading(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const sldContract = new Contract(HSR_SLD_ADDRESS, SLD_ABI, provider);
      const resolverContract = new Contract(DEFAULT_RESOLVER_ADDRESS, RESOLVER_ABI, provider);

      // Check ownership
      let tokenId = BigInt(0);
      try {
        tokenId = await sldContract.sldNamehashToTokenId(sldNamehash);
      } catch {
        setIsOwner(false);
        setLoading(false);
        return;
      }

      if (tokenId === BigInt(0)) {
        setIsOwner(false);
        setLoading(false);
        return;
      }

      const owner = await sldContract.ownerOf(tokenId);
      setSldOwner(owner);
      const ownerIsUser = owner.toLowerCase() === address.toLowerCase();
      setIsOwner(ownerIsUser);

      // Load current records
      const [flrAddr, ethAddrBytes, btcAddrBytes] = await Promise.all([
        resolverContract.addr(sldNamehash).catch(() => "0x0000000000000000000000000000000000000000"),
        resolverContract["addr(bytes32,uint256)"](sldNamehash, COINTYPE_ETH).catch(() => "0x"),
        resolverContract["addr(bytes32,uint256)"](sldNamehash, COINTYPE_BTC).catch(() => "0x"),
      ]);

      const flrAddrStr = flrAddr !== "0x0000000000000000000000000000000000000000" ? flrAddr : "";
      const ethAddrStr = ethAddrBytes && ethAddrBytes !== "0x" && ethAddrBytes.length >= 42
        ? getAddress("0x" + ethAddrBytes.slice(-40)) : "";
      const btcAddrStr = btcAddrBytes && btcAddrBytes !== "0x" && btcAddrBytes.length > 2
        ? tryDecodeBtcAddress(btcAddrBytes) : "";

      setAddresses([
        { label: "FLR Address", coinType: COINTYPE_FLR, value: flrAddrStr, original: flrAddrStr },
        { label: "ETH Address", coinType: COINTYPE_ETH, value: ethAddrStr, original: ethAddrStr },
        { label: "BTC Address", coinType: COINTYPE_BTC, value: btcAddrStr, original: btcAddrStr },
      ]);

      // Load text records
      const textPromises = TEXT_RECORD_DEFS.map((d) =>
        resolverContract.text(sldNamehash, d.key).catch(() => "")
      );
      const textValues = await Promise.all(textPromises);
      setTextRecords(
        TEXT_RECORD_DEFS.map((d, i) => ({ ...d, value: textValues[i] || "", original: textValues[i] || "" }))
      );

      // Load content hash
      try {
        const ch = await resolverContract.contenthash(sldNamehash);
        const chStr = ch && ch !== "0x" ? ch : "";
        setContentHash(chStr);
        setOriginalContentHash(chStr);
      } catch {
        setContentHash("");
        setOriginalContentHash("");
      }

      // Load primary name
      try {
        const pn = await resolverContract.name(sldNamehash);
        setPrimaryName(pn || "");
        setOriginalPrimaryName(pn || "");
      } catch {
        setPrimaryName("");
        setOriginalPrimaryName("");
      }
    } catch (err) {
      console.error("Failed to load records:", err);
      toast.error("Failed to load resolver records");
    } finally {
      setLoading(false);
    }
  }, [walletProvider, address, sldNamehash]);

  useEffect(() => {
    if (isConnected && walletProvider) {
      loadRecords();
    }
  }, [isConnected, walletProvider, loadRecords]);

  // Count total changes for batch save
  const addressChanges = addresses.filter((a) => a.value !== a.original);
  const textChanges = textRecords.filter((t) => t.value !== t.original);
  const contentHashChanged = contentHash !== originalContentHash;
  const primaryNameChanged = primaryName !== originalPrimaryName;
  const totalChanges = addressChanges.length + textChanges.length + (contentHashChanged ? 1 : 0) + (primaryNameChanged ? 1 : 0);

  const handleSaveAll = async () => {
    if (!walletProvider || totalChanges === 0) return;
    setSaving(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const resolverContract = new Contract(DEFAULT_RESOLVER_ADDRESS, RESOLVER_ABI, signer);

      const calls: string[] = [];

      // Address changes
      for (const a of addressChanges) {
        if (a.coinType === COINTYPE_FLR) {
          const iface = resolverContract.interface;
          calls.push(iface.encodeFunctionData("setAddr(bytes32,address)", [sldNamehash, a.value || "0x0000000000000000000000000000000000000000"]));
        } else {
          const addrBytes = a.value ? hexlify(toUtf8Bytes(a.value)) : "0x";
          const iface = resolverContract.interface;
          calls.push(iface.encodeFunctionData("setAddr(bytes32,uint256,bytes)", [sldNamehash, a.coinType, addrBytes]));
        }
      }

      // Text record changes
      for (const t of textChanges) {
        const iface = resolverContract.interface;
        calls.push(iface.encodeFunctionData("setText", [sldNamehash, t.key, t.value]));
      }

      // Content hash change
      if (contentHashChanged) {
        const iface = resolverContract.interface;
        const hashBytes = contentHash ? contentHash : "0x";
        calls.push(iface.encodeFunctionData("setContenthash", [sldNamehash, hashBytes]));
      }

      // Primary name change
      if (primaryNameChanged) {
        const iface = resolverContract.interface;
        calls.push(iface.encodeFunctionData("setName", [sldNamehash, primaryName]));
      }

      if (calls.length === 1) {
        // Single call — execute directly instead of multicall
        const tx = await signer.sendTransaction({
          to: DEFAULT_RESOLVER_ADDRESS,
          data: calls[0],
          gasLimit: BigInt(200000),
        });
        toast.info("Saving...");
        await tx.wait();
      } else {
        // Batch via multicall
        const tx = await resolverContract.multicall(calls, {
          gasLimit: BigInt(100000) * BigInt(calls.length + 1),
        });
        toast.info(`Saving ${calls.length} changes...`);
        await tx.wait();
      }

      // Update originals to match current values
      setAddresses((prev) => prev.map((a) => ({ ...a, original: a.value })));
      setTextRecords((prev) => prev.map((t) => ({ ...t, original: t.value })));
      setOriginalContentHash(contentHash);
      setOriginalPrimaryName(primaryName);

      toast.success(`${totalChanges} record${totalChanges > 1 ? "s" : ""} saved`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save records");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSingle = async (encodedData: string) => {
    if (!walletProvider) return;
    setSaving(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({
        to: DEFAULT_RESOLVER_ADDRESS,
        data: encodedData,
        gasLimit: BigInt(200000),
      });
      toast.info("Saving...");
      await tx.wait();
      toast.success("Record saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{fullName}</CardTitle>
            <CardDescription>Connect your wallet to manage resolver records</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <button
              onClick={() => open()}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg transition-colors"
            >
              Connect Wallet
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading {fullName} records...</p>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-red-400">
              {sldOwner ? "Not Authorized" : "Domain Not Found"}
            </CardTitle>
            <CardDescription>
              {sldOwner
                ? <>Only the domain owner can manage records.<br /><span className="text-xs text-muted-foreground mt-2 block">Owner: {sldOwner}</span></>
                : <>{fullName} is not registered. <a href="/register-v2" className="text-amber-400 underline">Register it now</a>.</>
              }
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">{fullName}</h1>
          <p className="text-muted-foreground">Resolver Record Management</p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(
            [
              { key: "addresses", label: "Addresses" },
              { key: "profile", label: "Profile" },
              { key: "website", label: "Website" },
              { key: "primary", label: "Primary Name" },
            ] as { key: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Batch Save Banner */}
        {totalChanges > 0 && (
          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
            <span className="text-sm text-amber-400">
              {totalChanges} unsaved change{totalChanges > 1 ? "s" : ""}
            </span>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-md text-sm transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save All Changes"}
            </button>
          </div>
        )}

        {/* Addresses Tab */}
        {tab === "addresses" && (
          <Card>
            <CardHeader>
              <CardTitle>Wallet Addresses</CardTitle>
              <CardDescription>
                Map your domain to wallet addresses on different chains.
                FLR address is auto-populated with your connected wallet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {addresses.map((a, i) => (
                <div key={a.label} className="space-y-1">
                  <label className="text-sm text-muted-foreground flex items-center gap-2">
                    {a.label}
                    {a.value !== a.original && (
                      <span className="text-amber-400 text-xs">(modified)</span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={a.value}
                      onChange={(e) => {
                        const updated = [...addresses];
                        updated[i] = { ...a, value: e.target.value };
                        setAddresses(updated);
                      }}
                      placeholder={a.coinType === COINTYPE_BTC ? "bc1q... or 1... or 3..." : "0x..."}
                      className="flex-1 px-3 py-2 bg-muted rounded-md text-sm font-mono"
                    />
                    {a.coinType === COINTYPE_FLR && !a.value && address && (
                      <button
                        onClick={() => {
                          const updated = [...addresses];
                          updated[i] = { ...a, value: address };
                          setAddresses(updated);
                        }}
                        className="px-3 py-2 bg-muted hover:bg-muted/80 rounded-md text-xs text-muted-foreground transition-colors"
                      >
                        Use connected
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Profile Tab */}
        {tab === "profile" && (
          <Card>
            <CardHeader>
              <CardTitle>Social & Profile</CardTitle>
              <CardDescription>
                Set text records for your domain. These are visible to anyone resolving your name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {textRecords.map((t, i) => (
                <div key={t.key} className="space-y-1">
                  <label className="text-sm text-muted-foreground flex items-center gap-2">
                    {t.label}
                    <span className="text-xs font-mono text-muted-foreground/60">({t.key})</span>
                    {t.value !== t.original && (
                      <span className="text-amber-400 text-xs">(modified)</span>
                    )}
                  </label>
                  <input
                    value={t.value}
                    onChange={(e) => {
                      const updated = [...textRecords];
                      updated[i] = { ...t, value: e.target.value };
                      setTextRecords(updated);
                    }}
                    placeholder={t.placeholder}
                    className="w-full px-3 py-2 bg-muted rounded-md text-sm"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Website Tab */}
        {tab === "website" && (
          <Card>
            <CardHeader>
              <CardTitle>Decentralized Website</CardTitle>
              <CardDescription>
                Set an IPFS or Arweave content hash to serve a decentralized website from your domain.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  Content Hash
                  {contentHashChanged && (
                    <span className="text-amber-400 text-xs">(modified)</span>
                  )}
                </label>
                <input
                  value={contentHash}
                  onChange={(e) => setContentHash(e.target.value)}
                  placeholder="ipfs://Qm... or 0xe301..."
                  className="w-full px-3 py-2 bg-muted rounded-md text-sm font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Enter an IPFS CID (ipfs://...) or the hex-encoded contenthash bytes.
                </p>
              </div>
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">How it works</p>
                <p>When someone visits your domain through a compatible browser or gateway, the contenthash is resolved and your decentralized website is loaded from IPFS or Arweave.</p>
                <p>To deploy a website: upload your site to IPFS via Pinata, Infura, or Filebase, then paste the CID here.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Primary Name Tab */}
        {tab === "primary" && (
          <Card>
            <CardHeader>
              <CardTitle>Primary Name</CardTitle>
              <CardDescription>
                Set this domain as the primary name for your wallet address (reverse resolution).
                When dApps look up your address, they'll display this name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  Primary Name
                  {primaryNameChanged && (
                    <span className="text-amber-400 text-xs">(modified)</span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    value={primaryName}
                    onChange={(e) => setPrimaryName(e.target.value)}
                    placeholder={fullName}
                    className="flex-1 px-3 py-2 bg-muted rounded-md text-sm"
                  />
                  {primaryName !== fullName && (
                    <button
                      onClick={() => setPrimaryName(fullName)}
                      className="px-3 py-2 bg-muted hover:bg-muted/80 rounded-md text-xs text-muted-foreground transition-colors"
                    >
                      Use {fullName}
                    </button>
                  )}
                </div>
              </div>
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">What is a primary name?</p>
                <p>A primary name is the reverse mapping from your wallet address to a domain name. When a dApp shows your address, it can resolve it to your primary name instead of the hex address.</p>
                <p>You can only set one primary name per address. Setting a new primary name replaces the previous one.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function tryDecodeBtcAddress(bytes: string): string {
  try {
    if (bytes && bytes.length > 2) {
      return toUtf8String(getBytes(bytes));
    }
  } catch {}
  return "";
}
