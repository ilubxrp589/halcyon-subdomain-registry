import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatFLR(amount: bigint | string | number, decimals = 4): string {
  const value = typeof amount === "bigint" ? Number(amount) / 1e18 : Number(amount);
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function getPriceTier(subdomain: string): {
  tier: string;
  priceUSD: number;
  color: string;
} {
  const length = subdomain.length;

  if (length === 1) {
    return { tier: "Ultra Premium", priceUSD: 500, color: "text-[#C0C0C0]" };
  } else if (length === 2) {
    return { tier: "Premium", priceUSD: 200, color: "text-[#FFD700]" };
  } else if (length === 3) {
    return { tier: "Standard Plus", priceUSD: 50, color: "text-[#B76E79]" };
  } else {
    return { tier: "Standard", priceUSD: 10, color: "text-[#CD7F32]" };
  }
}

export function isValidSubdomain(subdomain: string): { valid: boolean; error?: string } {
  if (!subdomain) {
    return { valid: false, error: "Subdomain is required" };
  }

  if (subdomain.length > 63) {
    return { valid: false, error: "Maximum 63 characters" };
  }

  const regex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  if (!regex.test(subdomain.toLowerCase())) {
    return { valid: false, error: "Only lowercase letters, numbers, and hyphens (not at start/end)" };
  }

  const reserved = ["www", "ftp", "mail", "smtp", "pop", "imap", "admin", "root", "api", "ns1", "ns2"];
  if (reserved.includes(subdomain.toLowerCase())) {
    return { valid: false, error: "This name is reserved" };
  }

  return { valid: true };
}

/**
 * Calculate credits earned for a domain purchase
 * Credit table:
 * - 1 domain = 10 credits
 * - 2 domains = 25 credits
 * - 3 domains = 35 credits
 * - 4 domains = 45 credits
 * - 5 domains = 55 credits
 * - 5+ domains = 55 + (count - 5) * 10 credits per additional
 *
 * @param domainCount - Number of domains being purchased
 * @returns Credits to be earned
 */
export function calculatePurchaseCredits(domainCount: number): number {
  if (domainCount <= 0) return 0;

  const creditTable: Record<number, number> = {
    1: 10,
    2: 25,
    3: 35,
    4: 45,
    5: 55,
  };

  if (domainCount <= 5) {
    return creditTable[domainCount];
  }

  // For 6+ domains: base 55 credits + 10 per additional domain
  return 55 + (domainCount - 5) * 10;
}
