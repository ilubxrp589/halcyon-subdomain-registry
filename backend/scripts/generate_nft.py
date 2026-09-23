#!/usr/bin/env python3
"""
NFT Image Generator using Stable Diffusion
Generates unique, deterministic artwork for Halcyon subdomain NFTs.

Usage:
    python generate_nft.py --subdomain "hello" --tld "cryptofans" --output /path/to/output.png
    python generate_nft.py --subdomain "hello" --tld "cryptofans" --custom-prompt "bigfoot catching a fish" --style cyberpunk
    python generate_nft.py --subdomain "x" --tld "cryptofans" --custom-prompt "golden dragon" --style cyberpunk --seed 12345

Note: --custom-prompt is optional. If not provided, generates based on subdomain name.
      --style enhances how it looks (e.g., cyberpunk, nature, corporate)

Requirements:
    pip install torch diffusers transformers accelerate pillow
"""

import argparse
import hashlib
import sys
import os
from pathlib import Path

# Suppress warnings
os.environ['TRANSFORMERS_VERBOSITY'] = 'error'
os.environ['DIFFUSERS_VERBOSITY'] = 'error'

import torch
from diffusers import StableDiffusionPipeline, DPMSolverMultistepScheduler
from PIL import Image, ImageDraw, ImageFont
import io


# =============================================================
#                     CONFIGURATION
# =============================================================

# Model configuration
MODEL_ID = os.environ.get('SD_MODEL_ID', 'runwayml/stable-diffusion-v1-5')
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
DTYPE = torch.float16 if DEVICE == 'cuda' else torch.float32

# Image settings
IMAGE_SIZE = 1024
INFERENCE_STEPS = 30
GUIDANCE_SCALE = 7.5

# Tier configurations with style modifiers
TIER_STYLES = {
    'ultra_premium': {
        'name': 'Ultra Premium',
        'modifiers': 'legendary, golden, ultra rare, crystalline, divine light, sacred geometry',
        'negative': 'low quality, blurry, simple',
        'color_accent': '#FFD700',
    },
    'premium': {
        'name': 'Premium',
        'modifiers': 'epic, purple aurora, mystical energy, ethereal glow, cosmic power',
        'negative': 'low quality, blurry',
        'color_accent': '#A855F7',
    },
    'standard_plus': {
        'name': 'Standard+',
        'modifiers': 'rare, blue cosmic, stellar, celestial patterns, digital constellation',
        'negative': 'low quality',
        'color_accent': '#38BDF8',
    },
    'standard': {
        'name': 'Standard',
        'modifiers': 'vibrant, green gradient, digital, matrix style, cyber aesthetic',
        'negative': 'low quality',
        'color_accent': '#34D399',
    },
}

# =============================================================
#                     STYLE MODIFIERS (20 Total)
# Users MUST provide a custom prompt describing their subject.
# Styles enhance HOW it looks, not WHAT it is.
# =============================================================

STYLE_MODIFIERS = {
    # ========== GENERAL STYLES (10) ==========
    'cyberpunk': {
        'name': 'Cyberpunk',
        'modifiers': 'neon lights, futuristic tech, glowing elements, dark city, rain-soaked streets, holographic displays, blade runner aesthetic',
        'negative': 'bright daylight, natural setting, rural, medieval, low tech',
    },
    'nature': {
        'name': 'Nature',
        'modifiers': 'organic elements, lush greenery, natural lighting, earth tones, botanical, forests and flora, serene wilderness',
        'negative': 'urban, city, technology, artificial, neon, industrial',
    },
    'corporate': {
        'name': 'Corporate',
        'modifiers': 'clean professional, minimalist design, business aesthetic, sleek modern, office environment, polished surfaces',
        'negative': 'messy, chaotic, grunge, dirty, fantasy, magical',
    },
    'retro': {
        'name': 'Retro',
        'modifiers': '80s synthwave, neon pink and blue, vintage aesthetic, nostalgic vibes, outrun style, retro grid, palm silhouettes',
        'negative': 'modern, contemporary, realistic, muted colors',
    },
    'minimalist': {
        'name': 'Minimalist',
        'modifiers': 'clean lines, negative space, modern design, simple composition, elegant simplicity, subtle gradients',
        'negative': 'busy, cluttered, complex, ornate, detailed patterns',
    },
    'fantasy': {
        'name': 'Fantasy',
        'modifiers': 'magical elements, ethereal glow, mystical atmosphere, enchanted, fairy tale, dragons and magic, epic fantasy',
        'negative': 'mundane, realistic, modern, technology, sci-fi',
    },
    'industrial': {
        'name': 'Industrial',
        'modifiers': 'metallic textures, gears, steampunk, mechanical, rivets and steel, factory aesthetic, brass and copper',
        'negative': 'organic, natural, soft, delicate, pastel',
    },
    'cosmic': {
        'name': 'Cosmic',
        'modifiers': 'space elements, stars, galaxies, celestial, nebula colors, astronomical, deep space, cosmic wonder',
        'negative': 'earthly, grounded, indoor, urban, mundane',
    },
    'abstract': {
        'name': 'Abstract',
        'modifiers': 'bold geometric shapes, modern art, vibrant colors, artistic, contemporary art, expressive forms',
        'negative': 'realistic, photographic, detailed, literal, figurative',
    },
    'elegant': {
        'name': 'Elegant',
        'modifiers': 'sophisticated, gold accents, luxury aesthetic, premium feel, refined, ornate details, high-end',
        'negative': 'cheap, casual, simple, rough, industrial',
    },

    # ========== BUSINESS-FOCUSED STYLES (10) ==========
    'tech': {
        'name': 'Tech & Software',
        'modifiers': 'digital interface, code elements, circuit patterns, blue glow, innovation, data visualization, futuristic UI',
        'negative': 'organic, natural, handmade, vintage, rustic',
    },
    'food': {
        'name': 'Food & Restaurant',
        'modifiers': 'appetizing colors, warm lighting, culinary art, fresh ingredients, gourmet presentation, food photography',
        'negative': 'cold, sterile, industrial, technology, abstract',
    },
    'medical': {
        'name': 'Healthcare',
        'modifiers': 'clean clinical white, medical symbols, healing energy, trust and care, professional healthcare, wellness',
        'negative': 'dirty, chaotic, scary, dark, fantasy',
    },
    'finance': {
        'name': 'Finance & Fintech',
        'modifiers': 'wealth aesthetic, charts and graphs elements, gold and green, prosperity, financial growth, premium banking',
        'negative': 'poor, cheap, casual, playful, childish',
    },
    'realestate': {
        'name': 'Real Estate',
        'modifiers': 'architectural elements, property showcase, home warmth, building silhouettes, modern architecture, luxury homes',
        'negative': 'industrial, abandoned, rundown, fantasy, sci-fi',
    },
    'ecommerce': {
        'name': 'E-commerce & Retail',
        'modifiers': 'shopping elements, product display, vibrant commerce, deals and offers, retail aesthetic, colorful packaging',
        'negative': 'minimalist, empty, industrial, corporate, muted',
    },
    'gaming': {
        'name': 'Gaming & Entertainment',
        'modifiers': 'game UI elements, action dynamic, RGB lighting, epic scenes, gaming aesthetic, esports energy',
        'negative': 'boring, static, corporate, professional, muted',
    },
    'education': {
        'name': 'Education',
        'modifiers': 'books and knowledge, graduation elements, wisdom light, learning environment, academic, scholarly',
        'negative': 'chaotic, entertainment, gaming, nightlife, party',
    },
    'travel': {
        'name': 'Travel & Tourism',
        'modifiers': 'wanderlust aesthetic, landmarks, adventure vibes, passport stamps, exotic destinations, journey',
        'negative': 'office, indoor, mundane, work, corporate',
    },
    'fitness': {
        'name': 'Sports & Fitness',
        'modifiers': 'athletic energy, motion blur, gym aesthetic, strength and power, dynamic movement, sports action',
        'negative': 'static, lazy, sedentary, slow, calm',
    },
}

# Default negative prompt
DEFAULT_NEGATIVE_PROMPT = 'low quality, blurry, deformed, ugly, bad anatomy, watermark, text, signature, amateur'

# Legacy: kept for backwards compatibility (maps tier to all styles)
# Old code used THEME_PROMPTS, now we use STYLE_MODIFIERS
THEME_PROMPTS = STYLE_MODIFIERS

# All styles available to all tiers
ALL_STYLES = list(STYLE_MODIFIERS.keys())

# Legacy: kept for backwards compatibility (maps tier to all styles)
ART_THEMES = {
    'ultra_premium': ALL_STYLES,
    'premium': ALL_STYLES,
    'standard_plus': ALL_STYLES,
    'standard': ALL_STYLES,
}


# =============================================================
#                     HELPER FUNCTIONS
# =============================================================

def get_tier(subdomain_length: int) -> str:
    """Determine tier based on subdomain length."""
    if subdomain_length == 1:
        return 'ultra_premium'
    elif subdomain_length == 2:
        return 'premium'
    elif subdomain_length == 3:
        return 'standard_plus'
    return 'standard'


def calculate_seed(subdomain: str, tld: str) -> int:
    """Calculate deterministic seed from subdomain and TLD."""
    combined = f"{subdomain.lower()}.{tld.lower()}"
    hash_bytes = hashlib.sha256(combined.encode()).digest()
    # Use first 4 bytes for seed (uint32)
    seed = int.from_bytes(hash_bytes[:4], byteorder='big')
    return seed % (2**32)


def build_prompt(subdomain: str, tld: str, tier: str, style: str = None, custom_prompt: str = None) -> tuple[str, str]:
    """Build the generation prompt combining user's subject with style modifiers.

    Args:
        subdomain: Subdomain name
        tld: TLD name
        tier: Price tier
        style: Style ID from STYLE_MODIFIERS
        custom_prompt: Optional - User's subject description (e.g., "bigfoot catching a fish")
                       If not provided, generates based on subdomain name.

    Returns:
        Tuple of (prompt, negative_prompt)
    """
    tier_config = TIER_STYLES.get(tier, TIER_STYLES['standard'])

    # Use custom prompt if provided, otherwise generate based on subdomain
    if custom_prompt and custom_prompt.strip():
        user_prompt = custom_prompt.strip()[:200]
    else:
        # Generate a prompt based on subdomain - interpret it creatively
        user_prompt = f"artistic representation of '{subdomain}', creative interpretation, symbolic imagery"

    # Get style config or default to minimalist
    style_config = STYLE_MODIFIERS.get(style, STYLE_MODIFIERS.get('minimalist', {
        'modifiers': 'clean lines, negative space, modern design, simple composition',
        'negative': 'busy, cluttered, complex',
    }))

    # Combine: User's subject + Style modifiers + Quality + Tier modifiers
    full_prompt = f"""{user_prompt}, {style_config['modifiers']}, digital artwork for '{subdomain}.{tld}', {tier_config['modifiers']}, highly detailed, professional artwork, 4k, trending on artstation"""

    # Combine negative prompts
    style_negative = style_config.get('negative', '')
    negative_prompt = f"{style_negative}, {DEFAULT_NEGATIVE_PROMPT}, {tier_config['negative']}, text, watermark, signature, username"

    return full_prompt, negative_prompt


def get_styles_for_tier(tier: str) -> list[str]:
    """Get available style names for a tier (all styles available to all tiers)."""
    return ALL_STYLES

# Backwards compatibility alias
def get_themes_for_tier(tier: str) -> list[str]:
    """Get available style names for a tier (legacy alias)."""
    return get_styles_for_tier(tier)


def add_overlay(image: Image.Image, subdomain: str, tld: str, tier: str) -> Image.Image:
    """Add Halcyon Subdomain Registry branding overlay to the generated image."""
    # Create a copy to avoid modifying original
    img = image.copy()
    draw = ImageDraw.Draw(img, 'RGBA')

    tier_config = TIER_STYLES.get(tier, TIER_STYLES['standard'])

    # Try to use nice fonts, fall back to default
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 52)
        font_medium = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
    except:
        font_large = ImageFont.load_default()
        font_medium = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # Add semi-transparent gradient bar at TOP
    top_bar_height = 100
    for y in range(top_bar_height):
        alpha = int(200 * (top_bar_height - y) / top_bar_height)
        draw.rectangle([(0, y), (image.width, y + 1)], fill=(15, 15, 26, alpha))

    # Add semi-transparent gradient bar at BOTTOM
    bottom_bar_height = 140
    for y in range(image.height - bottom_bar_height, image.height):
        alpha = int(220 * (y - (image.height - bottom_bar_height)) / bottom_bar_height)
        draw.rectangle([(0, y), (image.width, y + 1)], fill=(15, 15, 26, alpha))

    # Add "HALCYON" title at top
    brand_text = "HALCYON"
    brand_bbox = draw.textbbox((0, 0), brand_text, font=font_medium)
    brand_width = brand_bbox[2] - brand_bbox[0]
    brand_x = (image.width - brand_width) // 2
    brand_y = 20

    # Draw brand with glow
    for offset in range(2, 0, -1):
        draw.text((brand_x, brand_y), brand_text, font=font_medium,
                  fill=(255, 255, 255, 40))
    draw.text((brand_x, brand_y), brand_text, font=font_medium, fill=(255, 255, 255, 255))

    # Add "SUBDOMAIN REGISTRY" subtitle
    subtitle_text = "SUBDOMAIN REGISTRY"
    subtitle_bbox = draw.textbbox((0, 0), subtitle_text, font=font_small)
    subtitle_width = subtitle_bbox[2] - subtitle_bbox[0]
    subtitle_x = (image.width - subtitle_width) // 2
    subtitle_y = brand_y + 38
    draw.text((subtitle_x, subtitle_y), subtitle_text, font=font_small, fill=(255, 255, 255, 180))

    # Add domain name at bottom (larger, more prominent)
    domain_text = f"{subdomain}.{tld}"
    text_bbox = draw.textbbox((0, 0), domain_text, font=font_large)
    text_width = text_bbox[2] - text_bbox[0]
    text_x = (image.width - text_width) // 2
    text_y = image.height - 90

    # Draw domain text with glow effect
    for offset in range(4, 0, -1):
        glow_alpha = 60 - offset * 12
        draw.text((text_x - offset, text_y), domain_text, font=font_large,
                  fill=(255, 255, 255, glow_alpha))
        draw.text((text_x + offset, text_y), domain_text, font=font_large,
                  fill=(255, 255, 255, glow_alpha))
    draw.text((text_x, text_y), domain_text, font=font_large, fill=(255, 255, 255, 255))

    # Add tier badge at bottom
    tier_name = tier_config['name'].upper()
    tier_bbox = draw.textbbox((0, 0), tier_name, font=font_small)
    tier_width = tier_bbox[2] - tier_bbox[0]
    tier_x = (image.width - tier_width) // 2
    tier_y = image.height - 35

    # Draw tier with accent color
    draw.text((tier_x, tier_y), tier_name, font=font_small, fill=(255, 215, 0, 200))

    return img


# =============================================================
#                     MAIN GENERATOR
# =============================================================

class NFTGenerator:
    """Stable Diffusion NFT Image Generator."""

    def __init__(self, model_id: str = MODEL_ID, low_vram: bool = False):
        self.model_id = model_id
        self.low_vram = low_vram
        self.pipe = None

    def load_model(self):
        """Load the Stable Diffusion model."""
        if self.pipe is not None:
            return

        print(f"Loading model: {self.model_id}", file=sys.stderr)

        self.pipe = StableDiffusionPipeline.from_pretrained(
            self.model_id,
            torch_dtype=DTYPE,
            safety_checker=None,  # Disable for faster generation
            requires_safety_checker=False,
        )

        # Use DPM++ scheduler for faster, higher quality generation
        self.pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            self.pipe.scheduler.config
        )

        self.pipe = self.pipe.to(DEVICE)

        # Enable memory optimizations for RTX 3080
        if DEVICE == 'cuda':
            self.pipe.enable_attention_slicing(slice_size="auto")

            # VAE slicing for lower VRAM usage during decode
            self.pipe.enable_vae_slicing()

            # Enable xformers if available for even more memory efficiency
            try:
                self.pipe.enable_xformers_memory_efficient_attention()
                print("xformers memory efficient attention enabled", file=sys.stderr)
            except:
                pass

            # Enable sequential CPU offload for low VRAM mode (slower but uses ~3GB VRAM)
            if self.low_vram:
                self.pipe.enable_sequential_cpu_offload()
                print("Low VRAM mode: sequential CPU offload enabled", file=sys.stderr)

            # Clear any cached memory
            torch.cuda.empty_cache()

        print("Model loaded successfully", file=sys.stderr)

    def generate(
        self,
        subdomain: str,
        tld: str,
        tier: str = None,
        seed: int = None,
        theme: str = None,
        custom_prompt: str = None,
        steps: int = None,
        add_branding: bool = True,
    ) -> Image.Image:
        """Generate an NFT image for the given subdomain."""
        self.load_model()

        # Determine tier if not provided
        if tier is None:
            tier = get_tier(len(subdomain))

        # Calculate seed if not provided
        if seed is None:
            seed = calculate_seed(subdomain, tld)

        # Use provided steps or default
        actual_steps = steps if steps else INFERENCE_STEPS

        theme_str = f", theme: {theme}" if theme else ""
        custom_str = f", custom: yes" if custom_prompt else ""
        print(f"Generating image for {subdomain}.{tld} (tier: {tier}, seed: {seed}, steps: {actual_steps}{theme_str}{custom_str})", file=sys.stderr)

        # Build prompts
        prompt, negative_prompt = build_prompt(subdomain, tld, tier, theme, custom_prompt)

        # Set random seed for reproducibility
        generator = torch.Generator(device=DEVICE).manual_seed(seed)

        # Generate image
        result = self.pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            num_inference_steps=actual_steps,
            guidance_scale=GUIDANCE_SCALE,
            generator=generator,
            width=IMAGE_SIZE,
            height=IMAGE_SIZE,
        )

        image = result.images[0]

        # Free up VRAM after generation
        if DEVICE == 'cuda':
            del result  # Explicitly delete result tensors
            torch.cuda.empty_cache()
            import gc
            gc.collect()  # Force Python garbage collection

        # Add branding overlay
        if add_branding:
            image = add_overlay(image, subdomain, tld, tier)

        return image


def main():
    parser = argparse.ArgumentParser(description='Generate NFT images for Halcyon subdomains')
    parser.add_argument('--subdomain', required=True, help='Subdomain name')
    parser.add_argument('--tld', required=True, help='TLD name')
    parser.add_argument('--tier', choices=['ultra_premium', 'premium', 'standard_plus', 'standard'],
                        help='Override tier (auto-detected from subdomain length if not provided)')
    parser.add_argument('--seed', type=int, help='Override seed (calculated from domain if not provided)')
    parser.add_argument('--style', help='Visual style (e.g., cyberpunk, nature, corporate)')
    parser.add_argument('--theme', help='Alias for --style (backwards compatibility)')
    parser.add_argument('--custom-prompt', help='Custom subject description (e.g., "bigfoot catching a fish"). If not provided, generates based on subdomain name.')
    parser.add_argument('--steps', type=int, default=INFERENCE_STEPS, help=f'Inference steps (default: {INFERENCE_STEPS}, higher = better quality)')
    parser.add_argument('--output', '-o', help='Output file path (default: stdout as PNG)')
    parser.add_argument('--no-branding', action='store_true', help='Skip adding branding overlay')
    parser.add_argument('--model', default=MODEL_ID, help=f'Model ID (default: {MODEL_ID})')
    parser.add_argument('--low-vram', action='store_true', help='Enable aggressive VRAM saving (slower but safer)')
    parser.add_argument('--list-styles', action='store_true', help='List available styles and exit')
    parser.add_argument('--list-themes', action='store_true', help='Alias for --list-styles (backwards compatibility)')

    args = parser.parse_args()

    # List styles mode
    if args.list_styles or args.list_themes:
        styles = get_styles_for_tier('standard')
        print(f"Available styles: {', '.join(styles)}", file=sys.stderr)
        return

    # Get style (support both --style and --theme)
    selected_style = args.style or args.theme

    # Create generator
    generator = NFTGenerator(model_id=args.model, low_vram=args.low_vram)

    # Get custom prompt (use getattr for hyphenated argument)
    custom_prompt = getattr(args, 'custom_prompt', None)

    # Generate image
    image = generator.generate(
        subdomain=args.subdomain,
        tld=args.tld,
        tier=args.tier,
        seed=args.seed,
        theme=selected_style,  # Pass style as theme for backwards compatibility
        custom_prompt=custom_prompt,
        steps=args.steps,
        add_branding=not args.no_branding,
    )

    # Save or output image
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path, 'PNG')
        print(f"Image saved to: {output_path}", file=sys.stderr)
    else:
        # Output to stdout as PNG
        buffer = io.BytesIO()
        image.save(buffer, 'PNG')
        sys.stdout.buffer.write(buffer.getvalue())

    # Print seed and style used (for verification)
    seed_used = args.seed if args.seed else calculate_seed(args.subdomain, args.tld)
    print(f"Seed used: {seed_used}", file=sys.stderr)
    if selected_style:
        print(f"Style used: {selected_style}", file=sys.stderr)
    if custom_prompt:
        print(f"Custom prompt: {custom_prompt[:50]}...", file=sys.stderr)


if __name__ == '__main__':
    main()
