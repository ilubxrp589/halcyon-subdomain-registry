"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, ExternalLink, Globe, Twitter, Github, Mail, Clock, Shield, Wifi } from "lucide-react";

const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";
const EXPLORER_URL = "https://coston2-explorer.flare.network";
const SLD_CONTRACT = "0xA94F9BB2877e969b63e78c148fdc66A61E415110";

interface ProfileData {
  fqdn: string;
  subdomain: string;
  tld: string;
  owner_wallet: string;
  token_id: number;
  nft_image_cid: string | null;
  contenthash: string | null;
  tier: string;
  bio: string | null;
  layout: string;
  primary_color: string;
  bg_color: string;
  show_avatar: boolean;
  show_nft: boolean;
  textRecords: Record<string, string>;
  domain_mode: string;
  registration_date: string | null;
  expiration_date: string | null;
  resolved_address: string | null;
}

interface DnsEntry {
  name: string;
  type: string;
  content: string;
  ttl: number;
}

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function CopyableAddress({
  address,
  primaryColor,
  label,
}: {
  address: string;
  primaryColor: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
      title={`Copy ${label || "address"}`}
    >
      <span className="font-mono">{truncateAddress(address)}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

export function ProfilePageClient({
  profile,
  dnsRecords = [],
}: {
  profile: ProfileData;
  dnsRecords?: DnsEntry[];
}) {
  const nftImageUrl = profile.nft_image_cid
    ? `${IPFS_GATEWAY}/${profile.nft_image_cid}`
    : null;

  const socialLinks = [
    {
      key: "twitter",
      icon: Twitter,
      href: profile.textRecords?.twitter
        ? `https://twitter.com/${profile.textRecords.twitter.replace(/^@/, "")}`
        : null,
      label: "Twitter",
    },
    {
      key: "github",
      icon: Github,
      href: profile.textRecords?.github
        ? `https://github.com/${profile.textRecords.github}`
        : null,
      label: "GitHub",
    },
    {
      key: "email",
      icon: Mail,
      href: profile.textRecords?.email
        ? `mailto:${profile.textRecords.email}`
        : null,
      label: "Email",
    },
    {
      key: "url",
      icon: Globe,
      href: profile.textRecords?.url || null,
      label: "Website",
    },
  ].filter((l) => l.href);

  const isMinimal = profile.layout === "minimal";
  const isCard = profile.layout === "card";

  const explorerTokenUrl = profile.token_id != null
    ? `${EXPLORER_URL}/token/${SLD_CONTRACT}/instance/${profile.token_id}`
    : null;

  // Build attribute items for the details section
  const attributes: { label: string; value: string }[] = [
    { label: "TLD", value: `.${profile.tld || profile.fqdn.split(".").slice(1).join(".")}` },
    { label: "Label", value: profile.subdomain },
    { label: "Length", value: `${profile.subdomain.length} characters` },
  ];
  if (profile.registration_date) {
    attributes.push({ label: "Registered", value: formatDate(profile.registration_date) });
  }
  if (profile.expiration_date) {
    attributes.push({ label: "Expires", value: formatDate(profile.expiration_date) });
  }

  // Filter DNS records to only meaningful types
  const displayDns = dnsRecords.filter((r) =>
    ["A", "AAAA", "CNAME", "MX", "TXT"].includes(r.type)
  );

  return (
    <div
      className="min-h-screen flex flex-col items-center p-4 pt-12 pb-8"
      style={{ backgroundColor: profile.bg_color }}
    >
      {/* Main Card */}
      <div
        className={`w-full max-w-lg mx-auto ${
          isCard
            ? "rounded-2xl border border-white/10 shadow-2xl p-8"
            : isMinimal
            ? "p-4"
            : "p-8"
        }`}
        style={
          isCard
            ? { backgroundColor: `${profile.bg_color}ee`, backdropFilter: "blur(12px)" }
            : undefined
        }
      >
        {/* NFT Image */}
        {profile.show_nft && nftImageUrl && (
          <div className="flex justify-center mb-6">
            <img
              src={nftImageUrl}
              alt={`${profile.fqdn} NFT`}
              className={`${
                isMinimal ? "w-24 h-24" : "w-48 h-48"
              } rounded-2xl object-cover shadow-lg`}
            />
          </div>
        )}

        {/* Domain Name */}
        <h1
          className={`text-center font-bold ${
            isMinimal ? "text-2xl" : "text-3xl"
          } text-white mb-2`}
        >
          {profile.fqdn}
        </h1>

        {/* Tier Badge */}
        {profile.tier && !isMinimal && (
          <div className="flex justify-center mb-4">
            <span
              className="px-3 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: `${profile.primary_color}20`,
                color: profile.primary_color,
                border: `1px solid ${profile.primary_color}40`,
              }}
            >
              {profile.tier}
            </span>
          </div>
        )}

        {/* Owner Wallet */}
        {profile.show_avatar && (
          <div className="flex items-center justify-center gap-2 mb-4">
            <CopyableAddress
              address={profile.owner_wallet}
              primaryColor={profile.primary_color}
              label="owner wallet"
            />
          </div>
        )}

        {/* Bio */}
        {profile.bio && (
          <p className="text-center text-gray-300 mb-6 leading-relaxed">
            {profile.bio}
          </p>
        )}

        {/* Social Links */}
        {socialLinks.length > 0 && (
          <div className="flex items-center justify-center gap-3 mb-6">
            {socialLinks.map((link) => (
              <a
                key={link.key}
                href={link.href!}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-xl text-gray-400 hover:text-white transition-all hover:scale-110"
                style={{ backgroundColor: `${profile.primary_color}15` }}
                title={link.label}
              >
                <link.icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        )}

        {/* IPFS Content Link */}
        {profile.contenthash && (
          <div className="flex justify-center mb-6">
            <a
              href={`${IPFS_GATEWAY}/${profile.contenthash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors"
              style={{
                color: profile.primary_color,
                backgroundColor: `${profile.primary_color}10`,
                border: `1px solid ${profile.primary_color}30`,
              }}
            >
              <HardDriveIcon className="h-4 w-4" />
              View IPFS Content
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Resolved Address */}
      {profile.resolved_address && (
        <div className="w-full max-w-lg mx-auto mt-4">
          <div
            className="rounded-xl border border-white/10 p-5"
            style={{ backgroundColor: `${profile.bg_color}ee` }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4" style={{ color: profile.primary_color }} />
              <h3 className="text-sm font-semibold text-white">Resolved Address</h3>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-gray-300">
                {profile.resolved_address}
              </span>
              <CopyableAddress
                address={profile.resolved_address}
                primaryColor={profile.primary_color}
                label="resolved address"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Send FLR to <span className="font-medium text-gray-400">{profile.fqdn}</span> and it resolves to this address
            </p>
          </div>
        </div>
      )}

      {/* Domain Details */}
      {!isMinimal && (
        <div className="w-full max-w-lg mx-auto mt-4">
          <div
            className="rounded-xl border border-white/10 p-5"
            style={{ backgroundColor: `${profile.bg_color}ee` }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4" style={{ color: profile.primary_color }} />
              <h3 className="text-sm font-semibold text-white">Domain Details</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {attributes.map((attr) => (
                <div key={attr.label} className="flex flex-col">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">
                    {attr.label}
                  </span>
                  <span className="text-sm text-gray-200 font-medium mt-0.5">
                    {attr.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DNS Records */}
      {displayDns.length > 0 && !isMinimal && (
        <div className="w-full max-w-lg mx-auto mt-4">
          <div
            className="rounded-xl border border-white/10 p-5"
            style={{ backgroundColor: `${profile.bg_color}ee` }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Wifi className="h-4 w-4" style={{ color: profile.primary_color }} />
              <h3 className="text-sm font-semibold text-white">DNS Records</h3>
            </div>
            <div className="space-y-2">
              {displayDns.map((record, i) => (
                <div
                  key={`${record.type}-${record.name}-${i}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5"
                >
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: `${profile.primary_color}20`,
                      color: profile.primary_color,
                    }}
                  >
                    {record.type}
                  </span>
                  <span className="text-sm text-gray-300 font-mono truncate flex-1">
                    {record.content}
                  </span>
                  <span className="text-xs text-gray-600">{record.ttl}s</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Explorer Link */}
      {explorerTokenUrl && (
        <div className="w-full max-w-lg mx-auto mt-4 flex justify-center">
          <a
            href={explorerTokenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg transition-all hover:scale-[1.02]"
            style={{
              color: profile.primary_color,
              backgroundColor: `${profile.primary_color}10`,
              border: `1px solid ${profile.primary_color}25`,
            }}
          >
            <ExternalLink className="h-4 w-4" />
            View NFT on Flare Explorer
          </a>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center">
        <Link
          href="/"
          className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
        >
          Powered by Halcyon Registry
        </Link>
      </div>
    </div>
  );
}

function HardDriveIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="22" x2="2" y1="12" y2="12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      <line x1="6" x2="6.01" y1="16" y2="16" />
      <line x1="10" x2="10.01" y1="16" y2="16" />
    </svg>
  );
}
