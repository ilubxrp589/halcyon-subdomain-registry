import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProfilePageClient } from "./ProfilePageClient";

const API_BASE = process.env.API_URL || "http://localhost:8000/api/v1";
const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

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

async function getProfileData(domain: string): Promise<ProfileData | null> {
  try {
    const response = await fetch(`${API_BASE}/profile/${encodeURIComponent(domain)}`, {
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.profile || null;
  } catch (error) {
    console.error("Failed to fetch profile data:", error);
    return null;
  }
}

async function getDnsRecords(subdomain: string, tld: string): Promise<DnsEntry[]> {
  try {
    const response = await fetch(
      `${API_BASE}/dns/${encodeURIComponent(subdomain)}/${encodeURIComponent(tld)}/all`,
      { next: { revalidate: 60 } }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.entries || [];
  } catch {
    return [];
  }
}

interface PageProps {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const profile = await getProfileData(domain);

  if (!profile) {
    return {
      title: "Profile Not Found | Halcyon",
      description: "This domain profile could not be found.",
    };
  }

  const title = `${profile.fqdn} | Halcyon`;
  const description = profile.bio || `Web3 profile for ${profile.fqdn}`;
  const ogImageUrl = profile.nft_image_cid
    ? `${IPFS_GATEWAY}/${profile.nft_image_cid}`
    : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      url: `${SITE_URL}/profile/${domain}`,
      siteName: "Halcyon Subdomain Registry",
      ...(ogImageUrl && {
        images: [
          {
            url: ogImageUrl,
            width: 1024,
            height: 1024,
            alt: `${profile.fqdn} NFT`,
            type: "image/png",
          },
        ],
      }),
    },
    twitter: {
      card: ogImageUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(ogImageUrl && { images: [ogImageUrl] }),
      creator: profile.textRecords?.twitter
        ? `@${profile.textRecords.twitter.replace(/^@/, "")}`
        : "@HalcyonHNS",
    },
  };
}

export default async function ProfilePage({ params }: PageProps) {
  const { domain } = await params;
  const profile = await getProfileData(domain);

  if (!profile) {
    notFound();
  }

  // Parse subdomain and TLD for DNS lookup
  const subdomain = profile.subdomain;
  const tld = profile.tld || profile.fqdn.split(".").slice(1).join(".");

  // Fetch DNS records in parallel (non-blocking — profile renders even if DNS fails)
  const dnsRecords = await getDnsRecords(subdomain, tld);

  return <ProfilePageClient profile={profile} dnsRecords={dnsRecords} />;
}
