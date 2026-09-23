"use client";

// WalletButton component that wraps the w3m-button web component
// This avoids TypeScript errors with JSX.IntrinsicElements

export function WalletButton() {
  return <w3m-button />;
}
