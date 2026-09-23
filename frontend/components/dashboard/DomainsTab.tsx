"use client";

import { useState, useCallback } from "react";
import { BrowserProvider, Contract } from "ethers";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Globe,
  Plus,
  ExternalLink,
  Copy,
  Check,
  Settings,
  X,
  Save,
  ChevronDown,
  AlertCircle,
  ImageIcon,
  Trash2,
  Calendar,
  Clock,
  Tag,
  DollarSign,
  Wallet,
  Link2,
  Search,
  LayoutGrid,
  LayoutList,
  ArrowUpDown,
  ShoppingCart,
  Palette,
  ArrowRightLeft,
  HardDrive,
  Send,
} from "lucide-react";
import { DomainShareButton } from "@/components/DomainShareButton";
import { DnsSetupStatus } from "@/components/search/DnsSetupStatus";
import { DomainEmptyState } from "@/components/dashboard/DomainEmptyState";
import { truncateAddress, cn } from "@/lib/utils";
import {
  updateDNSRecords,
  deleteDNSRecords,
  getAllDomainRecords,
  resolveAddress,
  setResolvedAddress,
  getUrlForward,
  setUrlForward,
  deleteUrlForward,
  getContenthash,
  setContenthash,
  deleteContenthash,
  getProfile,
  updateProfileSettings,
  transferDomain as apiTransferDomain,
  type Domain,
  type DNSRecord,
  type DnsEntry,
  type UrlForward,
  type ContenthashResponse,
  type ProfileData,
  type ProfileSettings,
  type AuthCredentials,
} from "@/services/api";
import { useDomainFilters, type SortOption } from "@/hooks/useDomainFilters";

// NFT Contract ABI
const NFT_ABI = [
  "function renewDomain(uint256 tokenId) external payable",
  "function getRenewalPrice(uint256 tokenId) external view returns (uint256)",
  "function getDomainStatus(uint256 tokenId) external view returns (uint8)",
  "function gracePeriod() external view returns (uint256)",
  "function treasuryAddress() external view returns (address)",
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function safeTransferFrom(address from, address to, uint256 tokenId) external",
];

const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_MARKETPLACE;
const MARKETPLACE_ABI = [
  "function listFixedPrice(uint256 tokenId, uint256 price) external returns (uint256)",
  "function listAuction(uint256 tokenId, uint256 startingPrice, uint256 duration) external returns (uint256)",
  "function isTokenListed(uint256 tokenId) view returns (bool)",
  "function cancelListing(uint256 listingId) external",
  "function tokenToListing(uint256 tokenId) view returns (uint256)",
  "function listings(uint256 listingId) view returns (uint256 listingId, uint256 tokenId, address seller, uint256 price, uint256 endTime, uint8 listingType, uint8 status, address highestBidder, uint256 highestBid, uint256 createdAt)",
];

export interface DomainWithDNS extends Domain {
  dnsRecords?: DNSRecord[];
  dnsEntries?: DnsEntry[];
  isLoadingDNS?: boolean;
  dnsError?: string;
  renewalPrice?: string;
  domainStatus?: number;
  isListed?: boolean;
  listingId?: bigint;
  listingPrice?: string;
  resolvedAddress?: string | null;
  resolverSource?: "on-chain" | "database" | "owner";
  isLoadingResolution?: boolean;
  urlForward?: UrlForward | null;
  isLoadingForward?: boolean;
  contenthash?: ContenthashResponse | null;
  isLoadingContenthash?: boolean;
  profileData?: ProfileData | null;
  isLoadingProfile?: boolean;
}

interface NewDnsRecord {
  type: string;
  host: string;
  value: string;
}

const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "TXT"] as const;

interface DomainsTabProps {
  domains: DomainWithDNS[];
  setDomains: React.Dispatch<React.SetStateAction<DomainWithDNS[]>>;
  wallet: string;
  walletProvider: any;
  getAuthCredentials: () => Promise<AuthCredentials>;
  refreshCredentials: () => Promise<AuthCredentials>;
  isAuthenticating: boolean;
  currencySymbol: string;
  credits: any;
  onRefresh: () => void;
  onCustomizeDomain: (domain: DomainWithDNS) => void;
  isLoading: boolean;
  error: string | null;
}

export function DomainsTab({
  domains,
  setDomains,
  wallet,
  walletProvider,
  getAuthCredentials,
  refreshCredentials,
  isAuthenticating,
  currencySymbol,
  credits,
  onRefresh,
  onCustomizeDomain,
  isLoading,
  error,
}: DomainsTabProps) {
  const [expandedDomain, setExpandedDomain] = useState<number | null>(null);
  const [isSavingDNS, setIsSavingDNS] = useState(false);
  const [isDeletingDNS, setIsDeletingDNS] = useState<string | null>(null); // key of row being deleted
  const [dnsSuccess, setDnsSuccess] = useState<string | null>(null);
  const [newRecord, setNewRecord] = useState<NewDnsRecord>({ type: "A", host: "@", value: "" });
  const [confirmRenewal, setConfirmRenewal] = useState<number | null>(null);
  const [isRenewing, setIsRenewing] = useState(false);

  // Marketplace
  const [listingDomain, setListingDomain] = useState<DomainWithDNS | null>(null);
  const [listingPrice, setListingPrice] = useState("");
  const [listingType, setListingType] = useState<"fixed" | "auction">("fixed");
  const [auctionDuration, setAuctionDuration] = useState("24");
  const [isListing, setIsListing] = useState(false);
  const [cancelingListingIds, setCancelingListingIds] = useState<Set<number>>(new Set());

  // FLR Address
  const [editingWalletAddress, setEditingWalletAddress] = useState<number | null>(null);
  const [walletAddressInput, setWalletAddressInput] = useState("");
  const [isSavingWalletAddress, setIsSavingWalletAddress] = useState(false);
  const [walletAddressSuccess, setWalletAddressSuccess] = useState<string | null>(null);

  // URL Forwarding
  const [editingForward, setEditingForward] = useState<number | null>(null);
  const [forwardForm, setForwardForm] = useState<UrlForward>({ target_url: "", redirect_type: 301, path_forwarding: false, enabled: true });
  const [isSavingForward, setIsSavingForward] = useState(false);
  const [isDeletingForward, setIsDeletingForward] = useState(false);
  const [forwardSuccess, setForwardSuccess] = useState<string | null>(null);

  // IPFS
  const [editingContenthash, setEditingContenthash] = useState<number | null>(null);
  const [contenthashForm, setContenthashForm] = useState("");
  const [isSavingContenthash, setIsSavingContenthash] = useState(false);
  const [isDeletingContenthash, setIsDeletingContenthash] = useState(false);
  const [contenthashSuccess, setContenthashSuccess] = useState<string | null>(null);

  // Profile
  const [editingProfile, setEditingProfile] = useState<number | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileSettings>({ bio: "", layout: "standard", primary_color: "#f59e0b", bg_color: "#0f172a", show_avatar: true, show_nft: true, domain_mode: "redirect" });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  // Collapsible sections within expanded domain
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Transfer
  const [transferDomain, setTransferDomain] = useState<DomainWithDNS | null>(null);
  const [transferAddress, setTransferAddress] = useState("");
  const [transferConfirm, setTransferConfirm] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  // Filters
  const {
    filters, updateFilter, sortBy, setSortBy, viewMode, setViewMode,
    filteredDomains, availableTLDs, hasActiveFilters, activeFilterCount, clearAllFilters,
  } = useDomainFilters(domains);

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "name-asc", label: "Name A-Z" },
    { value: "name-desc", label: "Name Z-A" },
    { value: "registered-newest", label: "Registered (Newest)" },
    { value: "registered-oldest", label: "Registered (Oldest)" },
    { value: "expiring-soonest", label: "Expiring (Soonest)" },
    { value: "expiring-latest", label: "Expiring (Latest)" },
    { value: "token-asc", label: "Token ID (Asc)" },
    { value: "token-desc", label: "Token ID (Desc)" },
  ];

  // --- Domain operations (same logic as before, moved here) ---

  const loadDNSRecords = async (domain: DomainWithDNS) => {
    setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, isLoadingDNS: true, dnsError: undefined } : d));
    try {
      const parts = domain.fqdn.split(".");
      const { entries } = await getAllDomainRecords(parts[0], parts.slice(1).join("."));
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, dnsEntries: entries, isLoadingDNS: false } : d));
    } catch (err) {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, isLoadingDNS: false, dnsError: err instanceof Error ? err.message : "Failed to load DNS" } : d));
    }
  };

  const loadResolvedAddress = async (domain: DomainWithDNS) => {
    setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, isLoadingResolution: true } : d));
    try {
      const result = await resolveAddress(domain.fqdn);
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, resolvedAddress: result.address, resolverSource: result.source, isLoadingResolution: false } : d));
    } catch {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, isLoadingResolution: false } : d));
    }
  };

  const loadUrlForward = async (domain: DomainWithDNS) => {
    const [subdomain, ...tldParts] = domain.fqdn.split(".");
    const tld = tldParts.join(".");
    setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, isLoadingForward: true } : d));
    try {
      const result = await getUrlForward(subdomain, tld);
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, urlForward: result.configured ? result.forward! : null, isLoadingForward: false } : d));
    } catch {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, isLoadingForward: false } : d));
    }
  };

  const loadContenthash = async (domain: DomainWithDNS) => {
    const [subdomain, ...tldParts] = domain.fqdn.split(".");
    const tld = tldParts.join(".");
    setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, isLoadingContenthash: true } : d));
    try {
      const result = await getContenthash(subdomain, tld);
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, contenthash: result.configured ? result : null, isLoadingContenthash: false } : d));
    } catch {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, contenthash: null, isLoadingContenthash: false } : d));
    }
  };

  const loadProfileData = async (domain: DomainWithDNS) => {
    setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, isLoadingProfile: true } : d));
    try {
      const result = await getProfile(domain.fqdn);
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, profileData: result.profile, isLoadingProfile: false } : d));
    } catch {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, profileData: null, isLoadingProfile: false } : d));
    }
  };

  const toggleExpand = async (domain: DomainWithDNS) => {
    if (expandedDomain === domain.id) {
      setExpandedDomain(null);
      setEditingWalletAddress(null);
    } else {
      setExpandedDomain(domain.id);
      if (!domain.dnsEntries && !domain.isLoadingDNS) await loadDNSRecords(domain);
      if (domain.resolvedAddress === undefined && !domain.isLoadingResolution) await loadResolvedAddress(domain);
      if (domain.urlForward === undefined && !domain.isLoadingForward) loadUrlForward(domain);
      if (domain.contenthash === undefined && !domain.isLoadingContenthash) loadContenthash(domain);
      if (domain.profileData === undefined && !domain.isLoadingProfile) loadProfileData(domain);
    }
  };

  const addDNSRecord = async (domain: DomainWithDNS) => {
    if (!newRecord.value.trim()) return;
    setIsSavingDNS(true);
    setDnsSuccess(null);
    try {
      const credentials = await getAuthCredentials();
      const parts = domain.fqdn.split(".");
      const subdomain = parts[0];
      const tld = parts.slice(1).join(".");

      // Map record type to the backend's expected field names
      const typeToKey: Record<string, string> = { A: "ipv4", AAAA: "ipv6", CNAME: "cname", TXT: "txt" };
      const records: Record<string, string> = { [typeToKey[newRecord.type]]: newRecord.value.trim() };

      // host: '@' means root subdomain (no prefix), anything else is a sub-subdomain
      const host = newRecord.host.trim() === "@" ? undefined : newRecord.host.trim().toLowerCase();

      await updateDNSRecords(credentials, subdomain, tld, records, host);
      setDnsSuccess("Record added!");
      setNewRecord({ type: "A", host: "@", value: "" });
      await loadDNSRecords(domain);
    } catch (err) {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, dnsError: err instanceof Error ? err.message : "Failed to add record" } : d));
    } finally {
      setIsSavingDNS(false);
    }
  };

  const deleteOneRecord = async (domain: DomainWithDNS, entry: DnsEntry) => {
    const rowKey = `${entry.host}-${entry.type}-${entry.value}`;
    setIsDeletingDNS(rowKey);
    setDnsSuccess(null);
    try {
      const credentials = await getAuthCredentials();
      const parts = domain.fqdn.split(".");
      const subdomain = parts[0];
      const tld = parts.slice(1).join(".");
      const host = entry.host === "@" ? undefined : entry.host;
      await deleteDNSRecords(credentials, subdomain, tld, host, entry.type, entry.value);
      setDnsSuccess("Record deleted!");
      await loadDNSRecords(domain);
    } catch (err) {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, dnsError: err instanceof Error ? err.message : "Failed to delete record" } : d));
    } finally {
      setIsDeletingDNS(null);
    }
  };

  const fetchRenewalPrice = async (domain: DomainWithDNS) => {
    if (!walletProvider || !domain.token_id) return;
    try {
      const provider = new BrowserProvider(walletProvider);
      const nftAddress = process.env.NEXT_PUBLIC_CONTRACT_NFT;
      if (!nftAddress) return;
      const nftContract = new Contract(nftAddress, NFT_ABI, provider);
      const price = await nftContract.getRenewalPrice(domain.token_id);
      const status = await nftContract.getDomainStatus(domain.token_id);
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, renewalPrice: (Number(price) / 1e18).toFixed(2), domainStatus: Number(status) } : d));
    } catch (err) {
      console.error("Failed to fetch renewal price:", err);
    }
  };

  const renewDomainAction = async (domain: DomainWithDNS) => {
    if (!walletProvider || !domain.token_id) return;
    setIsRenewing(true);
    setDnsSuccess(null);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const nftAddress = process.env.NEXT_PUBLIC_CONTRACT_NFT;
      if (!nftAddress) throw new Error("NFT contract address not configured");
      const nftContract = new Contract(nftAddress, NFT_ABI, signer);
      const renewalPrice = await nftContract.getRenewalPrice(domain.token_id);
      const priceWithBuffer = (renewalPrice * BigInt(1005)) / BigInt(1000);
      const tx = await nftContract.renewDomain(domain.token_id, { value: priceWithBuffer });
      await tx.wait();
      setDnsSuccess(`${domain.fqdn} has been renewed for another year!`);
      setConfirmRenewal(null);
      onRefresh();
    } catch (err) {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, dnsError: err instanceof Error ? err.message : "Failed to renew domain" } : d));
    } finally {
      setIsRenewing(false);
    }
  };

  const listDomainForSale = async () => {
    if (!walletProvider || !listingDomain?.token_id || !listingPrice) return;
    setIsListing(true);
    setDnsSuccess(null);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const nftAddress = process.env.NEXT_PUBLIC_CONTRACT_NFT;
      if (!nftAddress || !MARKETPLACE_ADDRESS) throw new Error("Contract addresses not configured");
      const nftContract = new Contract(nftAddress, NFT_ABI, signer);
      const marketplace = new Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
      const isApproved = await nftContract.isApprovedForAll(await signer.getAddress(), MARKETPLACE_ADDRESS);
      if (!isApproved) {
        const approveTx = await nftContract.setApprovalForAll(MARKETPLACE_ADDRESS, true);
        await approveTx.wait();
      }
      const { parseEther } = await import("ethers");
      const priceWei = parseEther(listingPrice);
      let tx;
      if (listingType === "fixed") {
        tx = await marketplace.listFixedPrice(listingDomain.token_id, priceWei);
      } else {
        const durationSeconds = parseInt(auctionDuration) * 60 * 60;
        tx = await marketplace.listAuction(listingDomain.token_id, priceWei, durationSeconds);
      }
      await tx.wait();
      setDnsSuccess(`${listingDomain.fqdn} has been listed on the marketplace!`);
      setListingDomain(null);
      setListingPrice("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to list domain");
    } finally {
      setIsListing(false);
    }
  };

  const cancelMarketplaceListing = async (domain: DomainWithDNS) => {
    if (!walletProvider || !domain.listingId || !MARKETPLACE_ADDRESS) return;
    setCancelingListingIds((prev) => new Set(prev).add(domain.id));
    setDnsSuccess(null);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const marketplace = new Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
      const tx = await marketplace.cancelListing(domain.listingId);
      await tx.wait();
      const isStillListed = await marketplace.isTokenListed(domain.token_id);
      if (!isStillListed) {
        setDnsSuccess(`${domain.fqdn} has been removed from the marketplace.`);
        setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, isListed: false, listingId: undefined, listingPrice: undefined } : d));
      }
    } catch (err) {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, dnsError: err instanceof Error ? err.message : "Failed to cancel listing" } : d));
    } finally {
      setCancelingListingIds((prev) => { const next = new Set(prev); next.delete(domain.id); return next; });
    }
  };

  const startEditWalletAddress = (domain: DomainWithDNS) => {
    setEditingWalletAddress(domain.id);
    setWalletAddressInput(domain.resolvedAddress || wallet || "");
    setWalletAddressSuccess(null);
  };

  const saveWalletAddress = async (domain: DomainWithDNS) => {
    if (!walletAddressInput.trim()) return;
    if (!walletAddressInput.match(/^0x[a-fA-F0-9]{40}$/)) {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, dnsError: "Invalid wallet address format" } : d));
      return;
    }
    setIsSavingWalletAddress(true);
    setWalletAddressSuccess(null);
    try {
      const credentials = await getAuthCredentials();
      await setResolvedAddress(credentials, domain.fqdn, walletAddressInput.trim());
      setWalletAddressSuccess(`Wallet address set to ${truncateAddress(walletAddressInput, 6)}`);
      setEditingWalletAddress(null);
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, resolvedAddress: walletAddressInput.trim(), resolverSource: "database" as const } : d));
    } catch (err) {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, dnsError: err instanceof Error ? err.message : "Failed to save wallet address" } : d));
    } finally {
      setIsSavingWalletAddress(false);
    }
  };

  const startEditForward = (domain: DomainWithDNS) => {
    setEditingForward(domain.id);
    setForwardForm(domain.urlForward || { target_url: "", redirect_type: 301, path_forwarding: false, enabled: true });
    setForwardSuccess(null);
    if (domain.urlForward === undefined) loadUrlForward(domain);
  };

  const saveForward = async (domain: DomainWithDNS) => {
    if (!forwardForm.target_url.trim()) return;
    setIsSavingForward(true);
    setForwardSuccess(null);
    try {
      const credentials = await getAuthCredentials();
      const [subdomain, ...tldParts] = domain.fqdn.split(".");
      await setUrlForward(credentials, subdomain, tldParts.join("."), forwardForm);
      setForwardSuccess("URL forward configured successfully!");
      setEditingForward(null);
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, urlForward: { ...forwardForm } } : d));
    } catch (err) {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, dnsError: err instanceof Error ? err.message : "Failed to save URL forward" } : d));
    } finally {
      setIsSavingForward(false);
    }
  };

  const removeForward = async (domain: DomainWithDNS) => {
    setIsDeletingForward(true);
    try {
      const credentials = await getAuthCredentials();
      const [subdomain, ...tldParts] = domain.fqdn.split(".");
      await deleteUrlForward(credentials, subdomain, tldParts.join("."));
      setForwardSuccess("URL forward removed.");
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, urlForward: null } : d));
    } catch (err) {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, dnsError: err instanceof Error ? err.message : "Failed to delete URL forward" } : d));
    } finally {
      setIsDeletingForward(false);
    }
  };

  const startEditContenthash = (domain: DomainWithDNS) => {
    setEditingContenthash(domain.id);
    setContenthashForm(domain.contenthash?.cid || "");
    setContenthashSuccess(null);
    if (domain.contenthash === undefined) loadContenthash(domain);
  };

  const saveContenthashAction = async (domain: DomainWithDNS) => {
    if (!contenthashForm.trim()) return;
    setIsSavingContenthash(true);
    setContenthashSuccess(null);
    try {
      const credentials = await getAuthCredentials();
      const [subdomain, ...tldParts] = domain.fqdn.split(".");
      await setContenthash(credentials, subdomain, tldParts.join("."), contenthashForm.trim());
      setContenthashSuccess("IPFS contenthash configured successfully!");
      setEditingContenthash(null);
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, contenthash: { configured: true, cid: contenthashForm.trim(), dnslink: true, gateway_url: `https://gateway.pinata.cloud/ipfs/${contenthashForm.trim()}` } } : d));
    } catch (err) {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, dnsError: err instanceof Error ? err.message : "Failed to save contenthash" } : d));
    } finally {
      setIsSavingContenthash(false);
    }
  };

  const removeContenthash = async (domain: DomainWithDNS) => {
    setIsDeletingContenthash(true);
    try {
      const credentials = await getAuthCredentials();
      const [subdomain, ...tldParts] = domain.fqdn.split(".");
      await deleteContenthash(credentials, subdomain, tldParts.join("."));
      setContenthashSuccess("IPFS contenthash removed.");
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, contenthash: null } : d));
    } catch (err) {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, dnsError: err instanceof Error ? err.message : "Failed to delete contenthash" } : d));
    } finally {
      setIsDeletingContenthash(false);
    }
  };

  const startEditProfile = (domain: DomainWithDNS) => {
    setEditingProfile(domain.id);
    setProfileSuccess(null);
    setProfileForm({
      bio: domain.profileData?.bio || "",
      layout: domain.profileData?.layout || "standard",
      primary_color: domain.profileData?.primary_color || "#f59e0b",
      bg_color: domain.profileData?.bg_color || "#0f172a",
      show_avatar: domain.profileData?.show_avatar !== false,
      show_nft: domain.profileData?.show_nft !== false,
      domain_mode: domain.profileData?.domain_mode || "redirect",
    });
    if (domain.profileData === undefined) loadProfileData(domain);
  };

  const saveProfile = async (domain: DomainWithDNS) => {
    setIsSavingProfile(true);
    setProfileSuccess(null);
    try {
      const credentials = await getAuthCredentials();
      await updateProfileSettings(credentials, domain.fqdn, profileForm);
      setProfileSuccess("Profile settings saved!");
      setEditingProfile(null);
      setDomains((prev) => prev.map((d) => d.id === domain.id ? {
        ...d, profileData: {
          ...(d.profileData || {} as ProfileData), ...profileForm,
          fqdn: domain.fqdn, subdomain: domain.subdomain, owner_wallet: domain.owner_wallet,
          token_id: domain.token_id, nft_image_cid: null, contenthash: null, tier: domain.tier,
          textRecords: d.profileData?.textRecords || {},
        } as ProfileData,
      } : d));
    } catch (err) {
      setDomains((prev) => prev.map((d) => d.id === domain.id ? { ...d, dnsError: err instanceof Error ? err.message : "Failed to save profile settings" } : d));
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Transfer domain
  const executeTransfer = async () => {
    if (!transferDomain || !walletProvider || !transferAddress) return;
    if (transferConfirm !== "TRANSFER") return;

    setIsTransferring(true);
    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const nftAddress = process.env.NEXT_PUBLIC_CONTRACT_NFT;
      if (!nftAddress) throw new Error("NFT contract address not configured");

      const nftContract = new Contract(nftAddress, NFT_ABI, signer);
      const tx = await nftContract.safeTransferFrom(wallet, transferAddress, transferDomain.token_id);
      await tx.wait();

      // Update backend
      try {
        const credentials = await getAuthCredentials();
        await apiTransferDomain(credentials, transferDomain.fqdn, transferAddress, tx.hash);
      } catch (err) {
        console.error("Backend transfer update failed (on-chain succeeded):", err);
      }

      // Remove from local state
      setDomains((prev) => prev.filter((d) => d.id !== transferDomain.id));
      setTransferDomain(null);
      setTransferAddress("");
      setTransferConfirm("");
      setDnsSuccess(`${transferDomain.fqdn} transferred to ${truncateAddress(transferAddress, 6)}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setIsTransferring(false);
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "active": return "success";
      case "pending": case "expiring_soon": return "warning";
      case "grace_period": case "expired": case "suspended": return "destructive";
      case "reclaimed": return "secondary";
      default: return "outline";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active": return "Active Registration";
      case "pending": return "Pending";
      case "expired": return "Expired";
      case "suspended": return "Suspended";
      default: return status;
    }
  };

  return (
    <div>
      {/* Filter Toolbar */}
      {!isLoading && domains.length > 0 && (
        <div className="mb-6 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search domains..." value={filters.search} onChange={(e) => updateFilter("search", e.target.value)} className="pl-9" />
            </div>
            <Select value={filters.status} onValueChange={(v) => updateFilter("status", v as any)}>
              <SelectTrigger className="w-full md:w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.dns} onValueChange={(v) => updateFilter("dns", v as any)}>
              <SelectTrigger className="w-full md:w-[140px]"><SelectValue placeholder="DNS" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All DNS</SelectItem>
                <SelectItem value="active">DNS Active</SelectItem>
                <SelectItem value="pending">DNS Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.listing} onValueChange={(v) => updateFilter("listing", v as any)}>
              <SelectTrigger className="w-full md:w-[140px]"><SelectValue placeholder="Listing" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Listings</SelectItem>
                <SelectItem value="listed">Listed</SelectItem>
                <SelectItem value="not-listed">Not Listed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-full md:w-[180px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <div className="flex rounded-lg border bg-secondary/30 p-1">
              <button onClick={() => setViewMode("list")} className={cn("p-2 rounded transition-colors", viewMode === "list" ? "bg-background shadow-sm" : "hover:bg-background/50")} title="List view">
                <LayoutList className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode("grid")} className={cn("p-2 rounded transition-colors", viewMode === "grid" ? "bg-background shadow-sm" : "hover:bg-background/50")} title="Grid view">
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>

          {availableTLDs.length > 1 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground">TLD:</span>
              <button onClick={() => updateFilter("tld", null)} className={cn("px-3 py-1 rounded-full text-sm transition-colors", filters.tld === null ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80")}>All</button>
              {availableTLDs.map((tld) => (
                <button key={tld} onClick={() => updateFilter("tld", filters.tld === tld ? null : tld)} className={cn("px-3 py-1 rounded-full text-sm transition-colors font-mono", filters.tld === tld ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80")}>.{tld}</button>
              ))}
            </div>
          )}

          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {filters.search && <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20" onClick={() => updateFilter("search", "")}>Search: {filters.search}<X className="h-3 w-3 ml-1" /></Badge>}
              {filters.status !== "all" && <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20" onClick={() => updateFilter("status", "all")}>Status: {filters.status}<X className="h-3 w-3 ml-1" /></Badge>}
              {filters.dns !== "all" && <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20" onClick={() => updateFilter("dns", "all")}>DNS: {filters.dns}<X className="h-3 w-3 ml-1" /></Badge>}
              {filters.listing !== "all" && <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20" onClick={() => updateFilter("listing", "all")}>Listing: {filters.listing}<X className="h-3 w-3 ml-1" /></Badge>}
              {filters.tld && <Badge variant="secondary" className="cursor-pointer hover:bg-destructive/20" onClick={() => updateFilter("tld", null)}>TLD: .{filters.tld}<X className="h-3 w-3 ml-1" /></Badge>}
              <button onClick={clearAllFilters} className="text-sm text-muted-foreground hover:text-foreground underline">Clear all</button>
            </div>
          )}

          <div className="text-sm text-muted-foreground">Showing {filteredDomains.length} of {domains.length} domains</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="mb-4 border-red-500/30 bg-red-500/10">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-red-500"><AlertCircle className="h-5 w-5" /><span>{error}</span></div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <Card><CardContent className="py-12"><div className="text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" /><p className="text-muted-foreground">Loading your domains...</p></div></CardContent></Card>
      )}

      {/* Empty */}
      {!isLoading && domains.length === 0 && !error && (
        <Card><CardContent className="py-12"><div className="text-center"><Globe className="h-12 w-12 mx-auto mb-4 text-muted-foreground" /><h3 className="text-xl font-semibold mb-2">No Domains Yet</h3><p className="text-muted-foreground mb-6">You haven&apos;t registered any subdomains yet.</p><Link href="/register-v2"><Button><Plus className="h-4 w-4 mr-2" />Register Your First Domain</Button></Link></div></CardContent></Card>
      )}

      {/* Filtered Empty */}
      {!isLoading && domains.length > 0 && filteredDomains.length === 0 && (
        <DomainEmptyState hasFilters={hasActiveFilters} onClearFilters={clearAllFilters} filterCount={activeFilterCount} />
      )}

      {/* Domain List */}
      {!isLoading && filteredDomains.length > 0 && (
        <div className={cn("grid gap-4", viewMode === "grid" && "md:grid-cols-2 lg:grid-cols-3")}>
          {/* Expiry Warning Banner */}
          {(() => {
            const criticalDomains = filteredDomains.filter((d) => {
              if (!d.expiration_date) return false;
              const days = Math.ceil((new Date(d.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return days <= 14 && days > -60;
            });
            if (criticalDomains.length === 0) return null;
            return (
              <div className="mb-4 p-4 rounded-xl border-2 border-red-500/50 bg-red-500/10 flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-red-400">{criticalDomains.length} domain{criticalDomains.length > 1 ? "s" : ""} need{criticalDomains.length === 1 ? "s" : ""} attention!</p>
                  <p className="text-sm text-muted-foreground">{criticalDomains.map((d) => d.fqdn).join(", ")} — renew now to keep your domains</p>
                </div>
              </div>
            );
          })()}

          {filteredDomains.map((domain) => {
            const expirationDate = domain.expiration_date ? new Date(domain.expiration_date) : null;
            const daysUntilExpiry = expirationDate ? Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
            const gracePeriodDays = 60;
            const isReclaimed = domain.status === "reclaimed";
            const isInGrace = daysUntilExpiry !== null && daysUntilExpiry <= 0 && daysUntilExpiry > -gracePeriodDays;
            const isPastGrace = daysUntilExpiry !== null && daysUntilExpiry <= -gracePeriodDays;
            const isCritical = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 7;
            const isHigh = daysUntilExpiry !== null && daysUntilExpiry > 7 && daysUntilExpiry <= 14;
            const isElevated = daysUntilExpiry !== null && daysUntilExpiry > 14 && daysUntilExpiry <= 30;
            const isWarning = daysUntilExpiry !== null && daysUntilExpiry > 30 && daysUntilExpiry <= 60;
            const isInfo = daysUntilExpiry !== null && daysUntilExpiry > 60 && daysUntilExpiry <= 90;
            const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 30 && daysUntilExpiry > 0;
            const isExpired = isInGrace || isPastGrace || isReclaimed;

            return (
              <Card key={domain.id} id={`domain-${domain.id}`} className={cn(
                "group relative overflow-hidden rounded-xl border transition-all duration-200",
                viewMode === "grid" && "flex flex-col",
                viewMode === "grid" && expandedDomain === domain.id && "md:col-span-2 lg:col-span-3",
                "shadow-sm hover:shadow-lg border-border/50 bg-card hover:scale-[1.005] hover:border-primary/30",
                domain.isListed && "ring-2 ring-amber-500/20 bg-gradient-to-r from-amber-500/5 to-amber-500/5",
                isInfo && !domain.isListed && "ring-1 ring-blue-500/20 border-blue-500/20",
                isWarning && !domain.isListed && "ring-2 ring-amber-500/30 border-amber-500/30",
                isElevated && !domain.isListed && "ring-2 ring-orange-500/40 border-orange-500/40",
                isHigh && !domain.isListed && "ring-2 ring-orange-600/50 border-orange-600/50 bg-orange-500/5",
                isCritical && !domain.isListed && "ring-2 ring-red-500/60 border-red-500/60 bg-red-500/5 shadow-red-500/10 shadow-lg",
                isInGrace && "ring-2 ring-red-700/60 border-red-700/60 bg-red-900/10",
                (isPastGrace || isReclaimed) && "ring-1 ring-gray-500/30 border-gray-500/30 opacity-60"
              )}>
                <CardContent className="p-0">
                  {/* Status bar */}
                  {viewMode === "list" && (
                    <div className={cn(
                      "absolute left-0 top-0 bottom-0 w-1 rounded-l-xl",
                      domain.isListed && "bg-amber-500",
                      !domain.isListed && domain.status === "active" && !isExpiringSoon && !isExpired && !isInfo && !isWarning && "bg-green-500",
                      isInfo && "bg-blue-500", isWarning && "bg-amber-500", isElevated && "bg-orange-500",
                      isHigh && "bg-orange-600", isCritical && "bg-red-500 animate-pulse",
                      isInGrace && "bg-red-700 animate-pulse", (isPastGrace || isReclaimed) && "bg-gray-500"
                    )} />
                  )}

                  {/* Grid NFT Image */}
                  {viewMode === "grid" && (
                    <div className="relative w-full aspect-square bg-gradient-to-br from-primary/20 to-primary/5 cursor-pointer overflow-hidden" onClick={() => toggleExpand(domain)}>
                      <img src={`${window.location.origin}/api/proxy/nft/image/${domain.fqdn}?v=${domain.nft_status || "p"}`} alt={domain.fqdn} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" onError={(e) => { const t = e.target as HTMLImageElement; t.style.display = "none"; const f = t.parentElement?.querySelector(".fallback-icon"); if (f) (f as HTMLElement).style.display = "flex"; }} />
                      <div className="fallback-icon absolute inset-0 hidden items-center justify-center"><Globe className="h-16 w-16 text-primary/30" /></div>
                      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
                      {domain.isListed && <div className="absolute top-0 right-0"><div className="bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg shadow-lg">FOR SALE</div></div>}
                      {isInfo && !domain.isListed && <div className="absolute top-2 left-2"><Badge className="bg-blue-500/80 hover:bg-blue-600 gap-1"><Clock className="h-3 w-3" />{daysUntilExpiry}d</Badge></div>}
                      {(isWarning || isElevated) && !domain.isListed && <div className="absolute top-2 left-2"><Badge className={cn("gap-1", isElevated ? "bg-orange-500 hover:bg-orange-600 animate-pulse" : "bg-amber-500 hover:bg-amber-600")}><Clock className="h-3 w-3" />{daysUntilExpiry}d left</Badge></div>}
                      {isHigh && !domain.isListed && <div className="absolute top-2 left-2"><Badge className="bg-orange-600 hover:bg-orange-700 gap-1 animate-pulse"><AlertCircle className="h-3 w-3" />{daysUntilExpiry}d left</Badge></div>}
                      {isCritical && !domain.isListed && <div className="absolute top-2 left-2"><Badge className="bg-red-500 hover:bg-red-600 gap-1 animate-pulse shadow-lg shadow-red-500/30"><AlertCircle className="h-3 w-3" />{daysUntilExpiry}d — RENEW NOW</Badge></div>}
                      {isInGrace && <div className="absolute top-2 left-2"><Badge className="bg-red-700 hover:bg-red-800 gap-1 animate-pulse"><AlertCircle className="h-3 w-3" />GRACE: {Math.abs(daysUntilExpiry!)}d left to renew</Badge></div>}
                      {(isPastGrace || isReclaimed) && <div className="absolute top-2 left-2"><Badge className="bg-gray-500 hover:bg-gray-600 gap-1"><AlertCircle className="h-3 w-3" />RECLAIMED</Badge></div>}
                      {domain.isListed && domain.listingPrice && <div className="absolute bottom-2 right-2"><Badge className="bg-amber-500/90 backdrop-blur-sm hover:bg-amber-600 gap-1 text-sm font-bold"><DollarSign className="h-3 w-3" />{domain.listingPrice} {currencySymbol}</Badge></div>}
                    </div>
                  )}

                  {/* Domain Header Row */}
                  <div className={cn("flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4 cursor-pointer transition-colors", viewMode === "grid" && "flex-col md:flex-col", viewMode === "list" && "pl-5")} onClick={() => toggleExpand(domain)}>
                    <div className={cn("flex items-center gap-4", viewMode === "grid" && "w-full")}>
                      {viewMode === "list" && (
                        <div className="relative w-20 h-20 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 ring-2 ring-primary/10 shadow-md">
                          <img src={`${window.location.origin}/api/proxy/nft/image/${domain.fqdn}?v=${domain.nft_status || "p"}`} alt={domain.fqdn} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" onError={(e) => { const t = e.target as HTMLImageElement; t.style.display = "none"; const f = t.parentElement?.querySelector(".fallback-icon"); if (f) (f as HTMLElement).style.display = "flex"; }} />
                          <div className="fallback-icon hidden items-center justify-center absolute inset-0 bg-primary/10"><Globe className="h-8 w-8 text-primary" /></div>
                          {domain.isListed && <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center"><ShoppingCart className="h-2.5 w-2.5 text-white" /></div>}
                        </div>
                      )}
                      <div className={cn(viewMode === "grid" ? "flex-1" : "flex-1 min-w-0")}>
                        <div className={cn("font-mono tracking-tight transition-colors", viewMode === "list" ? "text-xl font-bold" : "text-base font-semibold", domain.isListed && "bg-gradient-to-r from-amber-500 to-amber-500 bg-clip-text text-transparent", !domain.isListed && "group-hover:text-primary")}>{domain.fqdn}</div>
                        <div className={cn("flex items-center gap-2 text-sm text-muted-foreground mt-1", viewMode === "grid" && "flex-wrap")}>
                          <span className="text-xs font-medium">#{domain.token_id}</span>
                          {viewMode === "list" && domain.isListed && <Badge className="bg-amber-500 hover:bg-amber-600 gap-1"><DollarSign className="h-3 w-3" />{domain.listingPrice} {currencySymbol}</Badge>}
                        </div>
                        {viewMode === "grid" && expirationDate && (
                          <div className={cn("flex items-center gap-1 mt-1.5 text-xs", isExpired && "text-red-500", isExpiringSoon && "text-amber-500", !isExpired && !isExpiringSoon && "text-muted-foreground")}>
                            <Clock className="h-3 w-3" /><span>{isExpired ? "Expired - Renew Now" : `Exp: ${daysUntilExpiry} days`}</span>
                          </div>
                        )}
                        {viewMode === "grid" && (
                          <div className="flex items-center gap-2 mt-2">
                            {domain.dns_active ? <div className="flex items-center gap-0.5 text-xs text-green-500"><Globe className="h-3 w-3" /><Check className="h-2.5 w-2.5" /></div> : <div className="flex items-center gap-0.5 text-xs text-muted-foreground/50"><Globe className="h-3 w-3" /></div>}
                            {domain.resolvedAddress ? <div className="flex items-center gap-0.5 text-xs text-green-500"><Wallet className="h-3 w-3" /><Check className="h-2.5 w-2.5" /></div> : <div className="flex items-center gap-0.5 text-xs text-muted-foreground/50"><Wallet className="h-3 w-3" /></div>}
                          </div>
                        )}
                        {viewMode === "list" && (
                          <div className="flex items-center gap-3 mt-2 text-sm">
                            {expirationDate && (
                              <div className={cn("flex items-center gap-1", isExpired && "text-red-500", isExpiringSoon && "text-amber-500", !isExpired && !isExpiringSoon && "text-muted-foreground")}>
                                <Calendar className="h-3.5 w-3.5" /><span className="text-xs">{isExpired ? "Expired" : `Expires: ${expirationDate.toLocaleDateString()} (${daysUntilExpiry} days)`}</span>
                              </div>
                            )}
                            <div className={cn("flex items-center gap-1 text-xs", domain.resolvedAddress ? "text-green-500" : "text-muted-foreground/50")}>
                              <Wallet className="h-3.5 w-3.5" /><span>{domain.resolvedAddress ? truncateAddress(domain.resolvedAddress, 4) : "Not set"}</span>{domain.resolvedAddress && <Check className="h-3 w-3" />}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={cn("flex items-center gap-2", viewMode === "grid" && "w-full justify-between mt-2")}>
                      {viewMode === "list" && (
                        <div className="flex items-center gap-2">
                          {domain.dns_active ? <Badge variant="success" className="gap-1"><Check className="h-3 w-3" />DNS</Badge> : <Badge variant="outline" className="opacity-70 gap-1"><Loader2 className="h-3 w-3 animate-spin" />DNS Setting Up</Badge>}
                          <Badge variant={getStatusVariant(domain.status)}>{getStatusLabel(domain.status)}</Badge>
                        </div>
                      )}
                      <div className={cn("flex items-center gap-1", viewMode === "grid" && "flex-wrap gap-1", viewMode === "list" && "opacity-0 group-hover:opacity-100 transition-opacity duration-200")}>
                        {viewMode === "grid" && (
                          <div className="flex items-center gap-1">
                            {domain.dns_active ? <Badge variant="success" className="text-xs gap-0.5"><Check className="h-2.5 w-2.5" />DNS</Badge> : <Badge variant="outline" className="text-xs opacity-50">No DNS</Badge>}
                          </div>
                        )}
                        <Button variant="outline" size="sm" title="View NFT Image" onClick={(e) => { e.stopPropagation(); window.open(`${window.location.origin}/api/proxy/nft/image/${domain.fqdn}?v=${domain.nft_status || "p"}`, "_blank"); }} className={cn("hover:bg-primary/10 hover:border-primary/50", viewMode === "grid" ? "h-8 w-8 p-0" : "h-9 w-9 p-0")}><ImageIcon className="h-4 w-4" /></Button>
                        {(!domain.nft_status || domain.nft_status === "placeholder") && (
                          <Button variant="outline" size="sm" title="Customize NFT" onClick={(e) => { e.stopPropagation(); onCustomizeDomain(domain); }} className={cn("text-primary hover:text-primary hover:bg-primary/10 hover:border-primary/50", viewMode === "grid" ? "h-8 w-8 p-0" : "h-9 w-9 p-0")}><Palette className="h-4 w-4" /></Button>
                        )}
                        <div onClick={(e) => e.stopPropagation()}><DomainShareButton domain={domain.fqdn} size="sm" className={cn(viewMode === "grid" ? "h-8 w-8 p-0" : "h-9 w-9 p-0")} /></div>
                        <Button variant="outline" size="sm" title="View on Explorer" onClick={(e) => { e.stopPropagation(); window.open(`https://coston2-explorer.flare.network/token/${process.env.NEXT_PUBLIC_CONTRACT_NFT}/instance/${domain.token_id}`, "_blank"); }} className={cn("hover:bg-primary/10 hover:border-primary/50", viewMode === "grid" ? "h-8 w-8 p-0" : "h-9 w-9 p-0")}><ExternalLink className="h-4 w-4" /></Button>
                        {domain.isListed ? (
                          <Button variant="outline" size="sm" title="Cancel Listing" onClick={(e) => { e.stopPropagation(); cancelMarketplaceListing(domain); }} disabled={cancelingListingIds.has(domain.id)} className={cn("text-red-500 hover:text-red-600 hover:bg-red-500/10 hover:border-red-500", viewMode === "grid" ? "h-8 w-8 p-0" : "h-9 w-9 p-0")}>
                            {cancelingListingIds.has(domain.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" title="List for Sale" onClick={(e) => { e.stopPropagation(); setListingDomain(domain); }} className={cn("text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 hover:border-amber-500", viewMode === "grid" ? "h-8 w-8 p-0" : "h-9 w-9 p-0")}><Tag className="h-4 w-4" /></Button>
                        )}
                        <Button variant="outline" size="sm" title="Renew Domain" onClick={(e) => { e.stopPropagation(); fetchRenewalPrice(domain); setConfirmRenewal(domain.id); setExpandedDomain(domain.id); }} className={cn("text-green-500 hover:text-green-600 hover:bg-green-500/10 hover:border-green-500", viewMode === "grid" ? "h-8 w-8 p-0" : "h-9 w-9 p-0")}><Calendar className="h-4 w-4" /></Button>
                        <Button variant="outline" size="sm" title="Transfer Domain" onClick={(e) => { e.stopPropagation(); setTransferDomain(domain); }} className={cn("text-orange-500 hover:text-orange-600 hover:bg-orange-500/10 hover:border-orange-500", viewMode === "grid" ? "h-8 w-8 p-0" : "h-9 w-9 p-0")}><Send className="h-4 w-4" /></Button>
                      </div>
                      <div className={cn("transition-transform duration-200", expandedDomain === domain.id && "rotate-180")}><ChevronDown className="h-5 w-5 text-muted-foreground" /></div>
                    </div>
                  </div>

                  {/* Expanded Section */}
                  {expandedDomain === domain.id && (
                    <div className="border-t bg-secondary/20 p-4 overflow-hidden">
                      {/* DNS Setup Progress */}
                      {!domain.dns_active && <DnsSetupStatus subdomain={domain.fqdn.split(".")[0]} tld={domain.fqdn.split(".").slice(1).join(".")} />}

                      {/* DNS Records */}
                      <button className="w-full flex items-center justify-between py-3 group" onClick={() => {
                        toggleSection(`dns-${domain.id}`);
                        if (!domain.dnsEntries && !domain.isLoadingDNS) loadDNSRecords(domain);
                      }}>
                        <h4 className="font-semibold flex items-center gap-2"><Settings className="h-4 w-4" />DNS Records</h4>
                        <div className="flex items-center gap-2">
                          {!openSections.has(`dns-${domain.id}`) && domain.dnsEntries && domain.dnsEntries.length > 0 && <Badge variant="outline" className="text-xs">{domain.dnsEntries.length} records</Badge>}
                          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.has(`dns-${domain.id}`) && "rotate-180")} />
                        </div>
                      </button>
                      {openSections.has(`dns-${domain.id}`) && <div className="pb-2">

                      {/* Renewal Confirmation */}
                      {confirmRenewal === domain.id && (
                        <div className="mb-4 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                          <p className="text-sm mb-2 font-semibold text-green-500">Renew Domain</p>
                          <p className="text-sm mb-3">Extend <strong>{domain.fqdn}</strong> for another year:</p>
                          <div className="text-sm mb-3 p-3 rounded bg-secondary/50">
                            <div className="flex justify-between"><span className="text-muted-foreground">Renewal Price:</span><span className="font-semibold">{domain.renewalPrice ? `${domain.renewalPrice} ${currencySymbol}` : "Loading..."}</span></div>
                            <div className="flex justify-between mt-1"><span className="text-muted-foreground">New Expiration:</span><span>+1 year from current</span></div>
                          </div>
                          {isRenewing && <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3"><Loader2 className="h-4 w-4 animate-spin" /><span>Processing renewal transaction...</span></div>}
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setConfirmRenewal(null)} disabled={isRenewing}>Cancel</Button>
                            <Button variant="default" size="sm" onClick={() => renewDomainAction(domain)} disabled={isRenewing || !domain.renewalPrice} className="bg-green-500 hover:bg-green-600">{isRenewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calendar className="h-4 w-4 mr-2" />}Renew for {domain.renewalPrice || "..."} {currencySymbol}</Button>
                          </div>
                        </div>
                      )}

                      {/* Success/Error Messages */}
                      {dnsSuccess && <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 text-sm">{dnsSuccess}</div>}
                      {domain.dnsError && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm">{domain.dnsError}</div>}

                      {/* Loading DNS */}
                      {domain.isLoadingDNS && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading DNS records...</span></div>}

                      {/* Fallback: data not yet loaded */}
                      {!domain.isLoadingDNS && !domain.dnsEntries && !domain.dnsError && (
                        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading DNS records...</span></div>
                      )}

                      {/* DNS Record Table */}
                      {!domain.isLoadingDNS && domain.dnsEntries && (
                        <div className="space-y-2">
                          {/* Table Header */}
                          <div className="grid grid-cols-[90px_100px_1fr_60px_40px] gap-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            <span>Type</span>
                            <span>Host</span>
                            <span>Value</span>
                            <span>TTL</span>
                            <span></span>
                          </div>

                          {/* Existing Records */}
                          {domain.dnsEntries.length === 0 && (
                            <p className="text-muted-foreground text-sm px-2 py-1">No DNS records configured yet.</p>
                          )}
                          {domain.dnsEntries.map((entry, idx) => {
                            const rowKey = `${entry.host}-${entry.type}-${entry.value}`;
                            const isDeleting = isDeletingDNS === rowKey;
                            return (
                              <div key={idx} className="grid grid-cols-[90px_100px_1fr_60px_40px] gap-2 items-center px-2 py-1.5 rounded bg-background/50 group">
                                <Badge variant="outline" className="w-[74px] justify-center text-xs">{entry.type}</Badge>
                                <span className="font-mono text-sm truncate" title={entry.host === "@" ? domain.fqdn : `${entry.host}.${domain.fqdn}`}>{entry.host}</span>
                                <span className="font-mono text-sm truncate min-w-0" title={entry.value}>{entry.value}</span>
                                <span className="text-xs text-muted-foreground">{entry.ttl}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                  onClick={() => deleteOneRecord(domain, entry)}
                                  disabled={isDeleting || isAuthenticating}
                                >
                                  {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                                </Button>
                              </div>
                            );
                          })}

                          {/* Add New Record Row */}
                          <div className="grid grid-cols-[90px_100px_1fr_60px_40px] gap-2 items-center px-2 py-1.5 rounded border border-dashed border-muted-foreground/30">
                            <Select value={newRecord.type} onValueChange={(v) => setNewRecord({ ...newRecord, type: v })}>
                              <SelectTrigger className="h-8 text-xs px-2"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {DNS_RECORD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Input
                              className="h-8 text-sm font-mono"
                              placeholder="@"
                              value={newRecord.host}
                              onChange={(e) => setNewRecord({ ...newRecord, host: e.target.value })}
                            />
                            <Input
                              className="h-8 text-sm font-mono"
                              placeholder={newRecord.type === "A" ? "192.168.1.1" : newRecord.type === "AAAA" ? "2001:db8::1" : newRecord.type === "CNAME" ? "example.com" : "v=spf1 ..."}
                              value={newRecord.value}
                              onChange={(e) => setNewRecord({ ...newRecord, value: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter" && newRecord.value.trim()) addDNSRecord(domain); }}
                            />
                            <span className="text-xs text-muted-foreground text-center">300</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                              onClick={() => addDNSRecord(domain)}
                              disabled={isSavingDNS || isAuthenticating || !newRecord.value.trim()}
                            >
                              {isSavingDNS ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            </Button>
                          </div>

                          {isAuthenticating && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span>Please sign the message in your wallet...</span></div>}
                        </div>
                      )}
                      </div>}

                      {/* FLR Address Resolution */}
                      <div className="border-t mt-4 pt-2">
                        <button className="w-full flex items-center justify-between py-3 group" onClick={() => toggleSection(`flr-${domain.id}`)}>
                          <h4 className="font-semibold flex items-center gap-2"><Wallet className="h-4 w-4" />FLR Address Resolution</h4>
                          <div className="flex items-center gap-2">
                            {!openSections.has(`flr-${domain.id}`) && domain.resolvedAddress && <Badge variant="success" className="text-xs">Configured</Badge>}
                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.has(`flr-${domain.id}`) && "rotate-180")} />
                          </div>
                        </button>
                        {openSections.has(`flr-${domain.id}`) && <div className="pb-2">
                        <div className="flex items-center justify-end mb-4">
                          {editingWalletAddress !== domain.id && <Button variant="outline" size="sm" onClick={() => startEditWalletAddress(domain)} disabled={domain.isLoadingResolution}><Link2 className="h-4 w-4 mr-2" />Set Wallet</Button>}
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">Send {currencySymbol} to <span className="font-mono text-primary">{domain.fqdn}</span> instead of a hex address</p>
                        {walletAddressSuccess && <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 text-sm">{walletAddressSuccess}</div>}
                        {domain.isLoadingResolution && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading resolved address...</span></div>}
                        {!domain.isLoadingResolution && editingWalletAddress !== domain.id && (
                          <div className="space-y-2">
                            {domain.resolvedAddress ? (
                              <div className="flex items-center gap-4 p-3 rounded bg-background/50 min-w-0">
                                <Badge variant="success" className="shrink-0"><Check className="h-3 w-3 mr-1" />Configured</Badge>
                                <span className="font-mono text-sm flex-1 truncate min-w-0">{domain.resolvedAddress}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{domain.resolverSource === "on-chain" && "On-chain"}{domain.resolverSource === "database" && "Database"}{domain.resolverSource === "owner" && "Default (Owner)"}</span>
                              </div>
                            ) : <p className="text-muted-foreground text-sm">No wallet address configured.</p>}
                          </div>
                        )}
                        {editingWalletAddress === domain.id && (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="walletAddress">Wallet Address</Label>
                              <Input id="walletAddress" placeholder="0x..." value={walletAddressInput} onChange={(e) => setWalletAddressInput(e.target.value)} className="font-mono" />
                              <p className="text-xs text-muted-foreground">Enter the Flare wallet address that will receive funds sent to {domain.fqdn}</p>
                            </div>
                            {isAuthenticating && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span>Please sign the message in your wallet...</span></div>}
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={() => { setEditingWalletAddress(null); setWalletAddressSuccess(null); }} disabled={isSavingWalletAddress || isAuthenticating}><X className="h-4 w-4 mr-2" />Cancel</Button>
                              <Button onClick={() => saveWalletAddress(domain)} disabled={isSavingWalletAddress || isAuthenticating || !walletAddressInput.trim()}>{isSavingWalletAddress ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Address</Button>
                            </div>
                          </div>
                        )}
                      </div>}
                      </div>

                      {/* URL Forwarding */}
                      <div className="border-t mt-4 pt-2">
                        <button className="w-full flex items-center justify-between py-3 group" onClick={() => toggleSection(`fwd-${domain.id}`)}>
                          <h4 className="font-semibold flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" />URL Forwarding</h4>
                          <div className="flex items-center gap-2">
                            {!openSections.has(`fwd-${domain.id}`) && domain.urlForward && <Badge variant={domain.urlForward.enabled ? "success" : "secondary"} className="text-xs">{domain.urlForward.enabled ? "Active" : "Disabled"}</Badge>}
                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.has(`fwd-${domain.id}`) && "rotate-180")} />
                          </div>
                        </button>
                        {openSections.has(`fwd-${domain.id}`) && <div className="pb-2">
                        <div className="flex items-center justify-end mb-4">
                          {editingForward !== domain.id && (
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => startEditForward(domain)} disabled={domain.isLoadingForward}>{domain.urlForward ? "Edit" : "Set Up"}</Button>
                              {domain.urlForward && <Button variant="outline" size="sm" onClick={() => removeForward(domain)} disabled={isDeletingForward || isAuthenticating} className="text-red-500 hover:text-red-600 hover:border-red-500"><Trash2 className="h-4 w-4" /></Button>}
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">Redirect <span className="font-mono text-primary">{domain.fqdn}</span> to any URL</p>
                        {forwardSuccess && <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 text-sm">{forwardSuccess}</div>}
                        {domain.isLoadingForward && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading forward config...</span></div>}
                        {!domain.isLoadingForward && editingForward !== domain.id && (
                          <div className="space-y-2">
                            {domain.urlForward ? (
                              <div className="p-3 rounded bg-background/50 space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant={domain.urlForward.enabled ? "success" : "secondary"} className="shrink-0">{domain.urlForward.enabled ? "Active" : "Disabled"}</Badge>
                                  <Badge variant="outline">{domain.urlForward.redirect_type}</Badge>
                                  {domain.urlForward.path_forwarding && <Badge variant="outline">Path Forwarding</Badge>}
                                </div>
                                <p className="font-mono text-sm truncate mt-1">{domain.urlForward.target_url}</p>
                              </div>
                            ) : <p className="text-muted-foreground text-sm">No URL forwarding configured.</p>}
                          </div>
                        )}
                        {editingForward === domain.id && (
                          <div className="space-y-4">
                            <div className="space-y-2"><Label htmlFor="targetUrl">Target URL</Label><Input id="targetUrl" placeholder="https://example.com" value={forwardForm.target_url} onChange={(e) => setForwardForm({ ...forwardForm, target_url: e.target.value })} /></div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-2"><Label>Redirect Type</Label><Select value={String(forwardForm.redirect_type)} onValueChange={(v) => setForwardForm({ ...forwardForm, redirect_type: Number(v) as 301 | 302 })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="301">301 (Permanent)</SelectItem><SelectItem value="302">302 (Temporary)</SelectItem></SelectContent></Select></div>
                              <div className="flex items-center gap-2 pt-6"><input type="checkbox" id="pathForwarding" checked={forwardForm.path_forwarding} onChange={(e) => setForwardForm({ ...forwardForm, path_forwarding: e.target.checked })} className="rounded" /><Label htmlFor="pathForwarding" className="cursor-pointer">Forward path</Label></div>
                              <div className="flex items-center gap-2 pt-6"><input type="checkbox" id="forwardEnabled" checked={forwardForm.enabled} onChange={(e) => setForwardForm({ ...forwardForm, enabled: e.target.checked })} className="rounded" /><Label htmlFor="forwardEnabled" className="cursor-pointer">Enabled</Label></div>
                            </div>
                            {isAuthenticating && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span>Please sign the message in your wallet...</span></div>}
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={() => { setEditingForward(null); setForwardSuccess(null); }} disabled={isSavingForward || isAuthenticating}><X className="h-4 w-4 mr-2" />Cancel</Button>
                              <Button onClick={() => saveForward(domain)} disabled={isSavingForward || isAuthenticating || !forwardForm.target_url.trim()}>{isSavingForward ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Forward</Button>
                            </div>
                          </div>
                        )}
                      </div>}
                      </div>

                      {/* IPFS Content */}
                      <div className="border-t mt-4 pt-2">
                        <button className="w-full flex items-center justify-between py-3 group" onClick={() => toggleSection(`ipfs-${domain.id}`)}>
                          <h4 className="font-semibold flex items-center gap-2"><HardDrive className="h-4 w-4" />IPFS Content</h4>
                          <div className="flex items-center gap-2">
                            {!openSections.has(`ipfs-${domain.id}`) && domain.contenthash && <Badge variant="success" className="text-xs">Configured</Badge>}
                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.has(`ipfs-${domain.id}`) && "rotate-180")} />
                          </div>
                        </button>
                        {openSections.has(`ipfs-${domain.id}`) && <div className="pb-2">
                        <div className="flex items-center justify-end mb-4">
                          {editingContenthash !== domain.id && (
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => startEditContenthash(domain)} disabled={domain.isLoadingContenthash}>{domain.contenthash ? "Edit" : "Set Up"}</Button>
                              {domain.contenthash && <Button variant="outline" size="sm" onClick={() => removeContenthash(domain)} disabled={isDeletingContenthash || isAuthenticating} className="text-red-500 hover:text-red-600 hover:border-red-500"><Trash2 className="h-4 w-4" /></Button>}
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">Point <span className="font-mono text-primary">{domain.fqdn}</span> to IPFS content via dnslink</p>
                        {contenthashSuccess && <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-500 text-sm">{contenthashSuccess}</div>}
                        {domain.isLoadingContenthash && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading IPFS config...</span></div>}
                        {!domain.isLoadingContenthash && editingContenthash !== domain.id && (
                          <div className="space-y-2">
                            {domain.contenthash ? (
                              <div className="p-3 rounded bg-background/50 space-y-2">
                                <div className="flex items-center gap-2"><Badge variant={domain.contenthash.dnslink ? "success" : "secondary"} className="shrink-0">{domain.contenthash.dnslink ? "Dnslink Active" : "No Dnslink"}</Badge></div>
                                <p className="font-mono text-sm truncate">{domain.contenthash.cid}</p>
                                {domain.contenthash.gateway_url && <a href={domain.contenthash.gateway_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1"><ExternalLink className="h-3 w-3" />View on IPFS Gateway</a>}
                              </div>
                            ) : <p className="text-muted-foreground text-sm">No IPFS content configured.</p>}
                          </div>
                        )}
                        {editingContenthash === domain.id && (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="ipfsCid">IPFS CID</Label>
                              <Input id="ipfsCid" placeholder="QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG" value={contenthashForm} onChange={(e) => setContenthashForm(e.target.value)} />
                              <p className="text-xs text-muted-foreground">Enter a CIDv0 (Qm...) or CIDv1 (bafy...) hash</p>
                            </div>
                            {contenthashForm.trim() && /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[a-z2-7]{58,})$/.test(contenthashForm.trim()) && (
                              <div className="p-2 rounded bg-muted/50 text-xs">
                                <span className="text-muted-foreground">Gateway preview: </span>
                                <a href={`https://gateway.pinata.cloud/ipfs/${contenthashForm.trim()}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">gateway.pinata.cloud/ipfs/{contenthashForm.trim().slice(0, 20)}...</a>
                              </div>
                            )}
                            {isAuthenticating && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span>Please sign the message in your wallet...</span></div>}
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={() => { setEditingContenthash(null); setContenthashSuccess(null); }} disabled={isSavingContenthash || isAuthenticating}><X className="h-4 w-4 mr-2" />Cancel</Button>
                              <Button onClick={() => saveContenthashAction(domain)} disabled={isSavingContenthash || isAuthenticating || !contenthashForm.trim() || !/^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[a-z2-7]{58,})$/.test(contenthashForm.trim())}>{isSavingContenthash ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save IPFS Content</Button>
                            </div>
                          </div>
                        )}
                      </div>}
                      </div>

                      {/* Profile Page */}
                      <div className="border-t mt-4 pt-2">
                        <button className="w-full flex items-center justify-between py-3 group" onClick={() => toggleSection(`profile-${domain.id}`)}>
                          <h4 className="font-semibold flex items-center gap-2"><Globe className="h-4 w-4 text-amber-400" />Profile Page</h4>
                          <div className="flex items-center gap-2">
                            {!openSections.has(`profile-${domain.id}`) && domain.profileData?.domain_mode === "profile" && <Badge variant="success" className="text-xs">Active</Badge>}
                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.has(`profile-${domain.id}`) && "rotate-180")} />
                          </div>
                        </button>
                        {openSections.has(`profile-${domain.id}`) && <div className="pb-2 space-y-3">
                        <div className="flex items-center justify-end">
                          <div className="flex items-center gap-2">
                            {editingProfile !== domain.id && <Button variant="ghost" size="sm" onClick={() => startEditProfile(domain)}><Settings className="h-3.5 w-3.5 mr-1" />{domain.profileData?.domain_mode === "profile" ? "Edit" : "Set Up"}</Button>}
                            {domain.profileData?.domain_mode === "profile" && editingProfile !== domain.id && <a href={`/profile/${domain.fqdn}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">Preview <ExternalLink className="h-3 w-3" /></a>}
                          </div>
                        </div>
                        {profileSuccess && <div className="p-2 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-sm">{profileSuccess}</div>}
                        {editingProfile !== domain.id && (
                          <div className="text-sm text-muted-foreground">
                            {domain.isLoadingProfile ? <div className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading...</div> : domain.profileData?.domain_mode === "profile" ? <div className="flex items-center gap-2"><Badge variant="success" className="shrink-0">Profile Active</Badge><span className="truncate">{domain.profileData.bio || "No bio set"}</span></div> : <span>Domain uses redirect mode. Enable profile page to show a Web3 profile.</span>}
                          </div>
                        )}
                        {editingProfile === domain.id && (
                          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                            <div className="space-y-2"><Label className="text-xs font-medium">Mode</Label><div className="flex gap-2"><Button variant={profileForm.domain_mode === "redirect" ? "default" : "outline"} size="sm" onClick={() => setProfileForm((f) => ({ ...f, domain_mode: "redirect" }))}>Redirect</Button><Button variant={profileForm.domain_mode === "profile" ? "default" : "outline"} size="sm" onClick={() => setProfileForm((f) => ({ ...f, domain_mode: "profile" }))}>Profile Page</Button></div></div>
                            <div className="space-y-2"><Label className="text-xs font-medium">Bio ({(profileForm.bio || "").length}/500)</Label><textarea className="w-full p-2 rounded-md border bg-background text-sm resize-none" rows={3} maxLength={500} placeholder="Tell visitors about yourself..." value={profileForm.bio || ""} onChange={(e) => setProfileForm((f) => ({ ...f, bio: e.target.value }))} /></div>
                            <div className="space-y-2"><Label className="text-xs font-medium">Layout</Label><div className="flex gap-2">{(["standard", "minimal", "card"] as const).map((l) => <Button key={l} variant={profileForm.layout === l ? "default" : "outline"} size="sm" onClick={() => setProfileForm((f) => ({ ...f, layout: l }))}>{l.charAt(0).toUpperCase() + l.slice(1)}</Button>)}</div></div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2"><Label className="text-xs font-medium">Primary Color</Label><div className="flex items-center gap-2"><input type="color" value={profileForm.primary_color || "#f59e0b"} onChange={(e) => setProfileForm((f) => ({ ...f, primary_color: e.target.value }))} className="w-8 h-8 rounded border cursor-pointer" /><Input value={profileForm.primary_color || "#f59e0b"} onChange={(e) => setProfileForm((f) => ({ ...f, primary_color: e.target.value }))} className="font-mono text-xs" /></div></div>
                              <div className="space-y-2"><Label className="text-xs font-medium">Background Color</Label><div className="flex items-center gap-2"><input type="color" value={profileForm.bg_color || "#0f172a"} onChange={(e) => setProfileForm((f) => ({ ...f, bg_color: e.target.value }))} className="w-8 h-8 rounded border cursor-pointer" /><Input value={profileForm.bg_color || "#0f172a"} onChange={(e) => setProfileForm((f) => ({ ...f, bg_color: e.target.value }))} className="font-mono text-xs" /></div></div>
                            </div>
                            <div className="flex gap-4">
                              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={profileForm.show_avatar !== false} onChange={(e) => setProfileForm((f) => ({ ...f, show_avatar: e.target.checked }))} className="rounded" />Show wallet address</label>
                              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={profileForm.show_nft !== false} onChange={(e) => setProfileForm((f) => ({ ...f, show_nft: e.target.checked }))} className="rounded" />Show NFT image</label>
                            </div>
                            {profileForm.domain_mode === "profile" && <a href={`/profile/${domain.fqdn}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">Preview profile page <ExternalLink className="h-3 w-3" /></a>}
                            {isAuthenticating && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span>Please sign the message in your wallet...</span></div>}
                            <div className="flex gap-2">
                              <Button variant="outline" onClick={() => { setEditingProfile(null); setProfileSuccess(null); }} disabled={isSavingProfile || isAuthenticating}><X className="h-4 w-4 mr-2" />Cancel</Button>
                              <Button onClick={() => saveProfile(domain)} disabled={isSavingProfile || isAuthenticating}>{isSavingProfile ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save Profile</Button>
                            </div>
                          </div>
                        )}
                      </div>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Listing Dialog */}
      {listingDomain && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" />List for Sale</CardTitle>
              <CardDescription>List <strong>{listingDomain.fqdn}</strong> on the marketplace</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Listing Type</Label><div className="flex gap-2"><Button variant={listingType === "fixed" ? "default" : "outline"} className="flex-1" onClick={() => setListingType("fixed")}><DollarSign className="h-4 w-4 mr-2" />Fixed Price</Button><Button variant={listingType === "auction" ? "default" : "outline"} className="flex-1" onClick={() => setListingType("auction")}><Clock className="h-4 w-4 mr-2" />Auction</Button></div></div>
              <div className="space-y-2"><Label>{listingType === "fixed" ? `Price (${currencySymbol})` : `Starting Price (${currencySymbol})`}</Label><Input type="number" placeholder={`Enter price in ${currencySymbol}`} value={listingPrice} onChange={(e) => setListingPrice(e.target.value)} min="0.01" step="0.01" /></div>
              {listingType === "auction" && <div className="space-y-2"><Label>Auction Duration</Label><select className="w-full p-2 rounded-md border bg-background" value={auctionDuration} onChange={(e) => setAuctionDuration(e.target.value)}><option value="1">1 hour</option><option value="6">6 hours</option><option value="12">12 hours</option><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option></select></div>}
              <div className="p-3 rounded-lg bg-secondary/50 text-sm"><p className="text-muted-foreground">Platform fee: 2.5% + 2.5% royalty on sale</p></div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setListingDomain(null); setListingPrice(""); }}>Cancel</Button>
                <Button className="flex-1" onClick={listDomainForSale} disabled={isListing || !listingPrice || parseFloat(listingPrice) < 0.01}>{isListing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Listing...</> : <><Tag className="h-4 w-4 mr-2" />List Domain</>}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transfer Dialog */}
      {transferDomain && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" />Transfer Domain</CardTitle>
              <CardDescription>Transfer <strong>{transferDomain.fqdn}</strong> to another wallet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Recipient Address</Label>
                <Input placeholder="0x..." value={transferAddress} onChange={(e) => setTransferAddress(e.target.value)} className="font-mono" />
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm">
                <p className="text-red-400 font-semibold mb-1">This action is irreversible!</p>
                <p className="text-muted-foreground">The NFT will be transferred on-chain and you will lose ownership of this domain.</p>
              </div>
              <div className="space-y-2">
                <Label>Type TRANSFER to confirm</Label>
                <Input value={transferConfirm} onChange={(e) => setTransferConfirm(e.target.value)} placeholder="TRANSFER" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setTransferDomain(null); setTransferAddress(""); setTransferConfirm(""); }}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={executeTransfer} disabled={isTransferring || transferConfirm !== "TRANSFER" || !transferAddress.match(/^0x[a-fA-F0-9]{40}$/)}>
                  {isTransferring ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Transferring...</> : <><Send className="h-4 w-4 mr-2" />Transfer</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
