import { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharePageClient } from "./SharePageClient";

// Use server-side API URL (not the proxy) for SSR
const API_BASE = process.env.API_URL || "http://localhost:8000/api/v1";
const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

interface ShareData {
  success: boolean;
  share?: {
    imageUrl: string;
    domain: string;
    model: string;
    themes: string[];
    createdAt: string;
    views: number;
  };
  error?: string;
}

async function getShareData(shareId: string): Promise<ShareData | null> {
  try {
    const response = await fetch(`${API_BASE}/share/${shareId}`, {
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    console.error("Failed to fetch share data:", error);
    return null;
  }
}

interface PageProps {
  params: Promise<{ shareId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shareId } = await params;
  const data = await getShareData(shareId);

  if (!data?.success || !data.share) {
    return {
      title: "Share Not Found | Halcyon",
      description: "This shared NFT preview could not be found.",
    };
  }

  const { share } = data;
  const themeName = share.themes?.[0] || "Custom";
  const title = `${share.domain} NFT | Halcyon`;
  const description = `Check out this ${themeName} themed NFT for ${share.domain} on Halcyon Subdomain Registry!`;

  // Use the IPFS image URL for OG image
  const ogImageUrl = share.imageUrl;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `${SITE_URL}/share/${shareId}`,
      siteName: "Halcyon Subdomain Registry",
      images: [
        {
          url: ogImageUrl,
          width: 1024,
          height: 1024,
          alt: `${share.domain} NFT Preview`,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
      creator: "@HalcyonHNS",
    },
    other: {
      "og:image:secure_url": ogImageUrl,
    },
  };
}

export default async function SharePage({ params }: PageProps) {
  const { shareId } = await params;
  const data = await getShareData(shareId);

  if (!data?.success || !data.share) {
    notFound();
  }

  return <SharePageClient share={data.share} shareId={shareId} />;
}
