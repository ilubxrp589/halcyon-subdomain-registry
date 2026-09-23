#!/usr/bin/env python3
"""
HSR Flux Schnell GGUF Q8 Generation - All 20 Styles via Triple GPU
Flux Schnell: 4 steps, CFG 1.0 (designed this way)
Start with: ./start-flux-3x-parallel.sh
"""

import json
import urllib.request
import random
import time
import sys

SERVERS = [
    "http://localhost:8188",
    "http://localhost:8189",
    "http://localhost:8190"
]

# Official HSR Style Modifiers (20 Total)
STYLES = {
    # ========== GENERAL STYLES (10) ==========
    "cyberpunk": "neon lights, futuristic tech, glowing elements, dark city, rain-soaked streets, holographic displays, blade runner aesthetic",
    "nature": "organic elements, lush greenery, natural lighting, earth tones, botanical, forests and flora, serene wilderness",
    "corporate": "clean professional, minimalist design, business aesthetic, sleek modern, office environment, polished surfaces",
    "retro": "80s synthwave, neon pink and blue, vintage aesthetic, nostalgic vibes, outrun style, retro grid, palm silhouettes",
    "minimalist": "clean lines, negative space, modern design, simple composition, elegant simplicity, subtle gradients",
    "fantasy": "magical elements, ethereal glow, mystical atmosphere, enchanted, fairy tale, dragons and magic, epic fantasy",
    "industrial": "metallic textures, gears, steampunk, mechanical, rivets and steel, factory aesthetic, brass and copper",
    "cosmic": "space elements, stars, galaxies, celestial, nebula colors, astronomical, deep space, cosmic wonder",
    "abstract": "bold geometric shapes, modern art, vibrant colors, artistic, contemporary art, expressive forms",
    "elegant": "sophisticated, gold accents, luxury aesthetic, premium feel, refined, ornate details, high-end",
    # ========== BUSINESS STYLES (10) ==========
    "tech": "digital interface, code elements, circuit patterns, blue glow, innovation, data visualization, futuristic UI",
    "food": "appetizing colors, warm lighting, culinary art, fresh ingredients, gourmet presentation, food photography",
    "medical": "clean clinical white, medical symbols, healing energy, trust and care, professional healthcare, wellness",
    "finance": "wealth aesthetic, charts and graphs elements, gold and green, prosperity, financial growth, premium banking",
    "realestate": "architectural elements, property showcase, home warmth, building silhouettes, modern architecture, luxury homes",
    "ecommerce": "shopping elements, product display, vibrant commerce, deals and offers, retail aesthetic, colorful packaging",
    "gaming": "game UI elements, action dynamic, RGB lighting, epic scenes, gaming aesthetic, esports energy",
    "education": "books and knowledge, graduation elements, wisdom light, learning environment, academic, scholarly",
    "travel": "wanderlust aesthetic, landmarks, adventure vibes, passport stamps, exotic destinations, journey",
    "fitness": "athletic energy, motion blur, gym aesthetic, strength and power, dynamic movement, sports action",
}

def create_flux_workflow(style_name, style_modifiers, custom_prompt, filename_prefix):
    """Create Flux Schnell GGUF Q8 workflow (4 steps, CFG 1.0)"""

    full_prompt = f"{custom_prompt}, {style_modifiers}, highly detailed, professional artwork, 4k"

    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "cfg": 1.0,  # Flux Schnell uses CFG 1.0
                "denoise": 1,
                "latent_image": ["5", 0],
                "model": ["4", 0],
                "negative": ["7", 0],
                "positive": ["6", 0],
                "sampler_name": "euler",
                "scheduler": "simple",
                "seed": random.randint(0, 2**32-1),
                "steps": 4  # Flux Schnell is designed for 4 steps
            }
        },
        "4": {
            "class_type": "UnetLoaderGGUF",
            "inputs": {
                "unet_name": "flux1-schnell-Q8_0.gguf"
            }
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "batch_size": 1,
                "height": 1024,
                "width": 1024
            }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["11", 0],
                "text": full_prompt
            }
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["11", 0],
                "text": ""  # Flux doesn't use negative prompts effectively
            }
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["3", 0],
                "vae": ["10", 0]
            }
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": f"FluxTest/{filename_prefix}",
                "images": ["8", 0]
            }
        },
        "10": {
            "class_type": "VAELoader",
            "inputs": {
                "vae_name": "ae.safetensors"
            }
        },
        "11": {
            "class_type": "DualCLIPLoader",
            "inputs": {
                "clip_name1": "t5xxl_fp8_e4m3fn.safetensors",
                "clip_name2": "clip_l.safetensors",
                "type": "flux"
            }
        }
    }

def queue_prompt(server, workflow):
    """Send workflow to ComfyUI server"""
    data = json.dumps({"prompt": workflow}).encode('utf-8')
    req = urllib.request.Request(
        f"{server}/prompt",
        data=data,
        headers={'Content-Type': 'application/json'}
    )
    try:
        response = urllib.request.urlopen(req, timeout=10)
        return json.loads(response.read())
    except Exception as e:
        print(f"Error queuing to {server}: {e}")
        return None

def main():
    styles_to_generate = list(STYLES.keys())
    custom_prompt = "premium NFT domain card for blockchain registry, digital ownership certificate"

    # Parse arguments
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg == "general":
            styles_to_generate = list(STYLES.keys())[:10]
        elif arg == "business":
            styles_to_generate = list(STYLES.keys())[10:]
        elif arg == "test":
            styles_to_generate = ["cyberpunk", "cosmic", "elegant"]  # Quick test
        elif arg in STYLES:
            styles_to_generate = [arg]

    if len(sys.argv) > 2:
        custom_prompt = sys.argv[2]

    print(f"\n=== HSR Flux Schnell GGUF Q8 Triple GPU ===")
    print(f"Styles: {len(styles_to_generate)}")
    print(f"Model: flux1-schnell-Q8_0.gguf (4 steps)")
    print(f"Output: /home/localai/ComfyUI/output/FluxTest/\n")

    for i, style_name in enumerate(styles_to_generate):
        server = SERVERS[i % len(SERVERS)]
        style_modifiers = STYLES[style_name]
        workflow = create_flux_workflow(style_name, style_modifiers, custom_prompt, style_name)

        print(f"[{i+1}/{len(styles_to_generate)}] {style_name} -> GPU {SERVERS.index(server)}")

        result = queue_prompt(server, workflow)
        if result:
            print(f"      Queued: {result.get('prompt_id', 'OK')[:8]}...")
        else:
            print(f"      FAILED")

        time.sleep(0.5)

    print(f"\nAll {len(styles_to_generate)} queued!")
    print("Output: /home/localai/ComfyUI/output/FluxTest/")

if __name__ == "__main__":
    main()
