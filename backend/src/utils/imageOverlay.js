/**
 * Image Overlay Utility - Modern Professional Watermark
 * Adds Halcyon branding overlay to NFT images
 *
 * Design: Subtle corner-positioned elements, glassmorphic effects
 * Layout:
 * ┌────────────────────────────────────────┐
 * │ [H logo]                    [tier pill]│  ← Top corners
 * │                                        │
 * │           (artwork area)               │
 * │                                        │
 * │                                        │
 * │ [domain.tld]                           │  ← Bottom left
 * └────────────────────────────────────────┘
 */

import { createCanvas, loadImage } from 'canvas';

// Tier color accents
const TIER_COLORS = {
  ultra_premium: '#FFD700',  // Gold
  premium: '#A855F7',        // Purple
  standard_plus: '#38BDF8',  // Blue
  standard: '#34D399',       // Green
};

const TIER_NAMES = {
  ultra_premium: 'ULTRA',
  premium: 'PREMIUM',
  standard_plus: 'STANDARD+',
  standard: 'STANDARD',
};

/**
 * Draw rounded rectangle helper
 */
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draw Halcyon logo badge (top-left)
 */
function drawHalcyonBadge(ctx, x, y, tier) {
  const size = 52;
  const tierColor = TIER_COLORS[tier] || TIER_COLORS.standard;

  ctx.save();

  // Glassmorphic background circle
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fill();

  // Gradient border
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, 'rgba(52, 211, 153, 0.9)');  // halcyon-green
  gradient.addColorStop(1, 'rgba(20, 184, 166, 0.9)');  // halcyon-teal
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // "H" letter
  ctx.font = 'bold 30px DejaVu Sans, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = tierColor;
  ctx.fillText('H', x + size / 2, y + size / 2 + 2);

  ctx.restore();
}

/**
 * Draw tier pill badge (top-right)
 */
function drawTierPill(ctx, rightX, y, tier) {
  const tierName = TIER_NAMES[tier] || TIER_NAMES.standard;
  const tierColor = TIER_COLORS[tier] || TIER_COLORS.standard;

  ctx.save();

  ctx.font = 'bold 14px DejaVu Sans, Arial, sans-serif';
  const textWidth = ctx.measureText(tierName).width;
  const pillWidth = textWidth + 28;
  const pillHeight = 30;
  const x = rightX - pillWidth;

  // Glassmorphic pill background
  roundRect(ctx, x, y, pillWidth, pillHeight, 15);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fill();

  // Tier color border
  ctx.strokeStyle = tierColor + 'AA';  // ~67% opacity
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = tierColor;
  ctx.fillText(tierName, x + pillWidth / 2, y + pillHeight / 2 + 1);

  ctx.restore();
}

/**
 * Draw domain name (bottom-left)
 */
function drawDomainName(ctx, x, bottomY, subdomain, tld, tier) {
  const domainText = `${subdomain}.${tld}`;
  const tierColor = TIER_COLORS[tier] || TIER_COLORS.standard;

  ctx.save();
  ctx.font = 'bold 34px DejaVu Sans, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';

  // Shadow for readability
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillText(domainText, x + 2, bottomY + 2);

  // Main text with gradient
  const textWidth = ctx.measureText(domainText).width;
  const gradient = ctx.createLinearGradient(x, bottomY - 34, x + textWidth, bottomY);
  gradient.addColorStop(0, '#FFFFFF');
  gradient.addColorStop(0.7, '#FFFFFF');
  gradient.addColorStop(1, tierColor);
  ctx.fillStyle = gradient;
  ctx.fillText(domainText, x, bottomY);

  ctx.restore();
}

/**
 * Draw subtle corner gradients (anti-removal protection)
 */
function drawCornerGradients(ctx, width, height) {
  // Top-left corner fade (for logo)
  const tlGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 130);
  tlGradient.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
  tlGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = tlGradient;
  ctx.fillRect(0, 0, 160, 160);

  // Top-right corner fade (for tier)
  const trGradient = ctx.createRadialGradient(width, 0, 0, width, 0, 120);
  trGradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
  trGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = trGradient;
  ctx.fillRect(width - 160, 0, 160, 100);

  // Bottom-left corner fade (for domain)
  const blGradient = ctx.createRadialGradient(0, height, 0, 0, height, 180);
  blGradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
  blGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = blGradient;
  ctx.fillRect(0, height - 120, 350, 120);
}

/**
 * Add Halcyon branding overlay to an image buffer
 * @param {Buffer} imageBuffer - Input PNG image buffer
 * @param {string} subdomain - Subdomain name
 * @param {string} tld - TLD name
 * @param {string} tier - Tier level
 * @returns {Promise<Buffer>} - Output PNG image buffer with overlay
 */
export async function addBrandingOverlay(imageBuffer, subdomain, tld, tier = 'standard') {
  const image = await loadImage(imageBuffer);
  const width = image.width;
  const height = image.height;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw original image
  ctx.drawImage(image, 0, 0);

  // Draw corner gradients first (behind other elements)
  drawCornerGradients(ctx, width, height);

  // Draw branding elements
  drawHalcyonBadge(ctx, 20, 20, tier);
  drawTierPill(ctx, width - 20, 20, tier);
  drawDomainName(ctx, 24, height - 20, subdomain, tld, tier);

  return canvas.toBuffer('image/png');
}

/**
 * Get tier from subdomain length
 */
export function getTierFromLength(subdomain) {
  const length = subdomain.length;
  if (length === 1) return 'ultra_premium';
  if (length === 2) return 'premium';
  if (length === 3) return 'standard_plus';
  return 'standard';
}

export default { addBrandingOverlay, getTierFromLength };
