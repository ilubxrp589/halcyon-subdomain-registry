#!/usr/bin/env python3
"""
HSR Image Generation - All 20 Styles via Triple SDXL
Uses the official HSR style system from backend/src/services/comfyui.js
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
    "cyberpunk": {
        "modifiers": "neon lights, futuristic tech, glowing elements, dark city, rain-soaked streets, holographic displays, blade runner aesthetic",
        "negative": "bright daylight, natural setting, rural, medieval, low tech"
    },
    "nature": {
        "modifiers": "organic elements, lush greenery, natural lighting, earth tones, botanical, forests and flora, serene wilderness",
        "negative": "urban, city, technology, artificial, neon, industrial"
    },
    "corporate": {
        "modifiers": "clean professional, minimalist design, business aesthetic, sleek modern, office environment, polished surfaces",
        "negative": "messy, chaotic, grunge, dirty, fantasy, magical"
    },
    "retro": {
        "modifiers": "80s synthwave, neon pink and blue, vintage aesthetic, nostalgic vibes, outrun style, retro grid, palm silhouettes",
        "negative": "modern, contemporary, realistic, muted colors"
    },
    "minimalist": {
        "modifiers": "clean lines, negative space, modern design, simple composition, elegant simplicity, subtle gradients",
        "negative": "busy, cluttered, complex, ornate, detailed patterns"
    },
    "fantasy": {
        "modifiers": "magical elements, ethereal glow, mystical atmosphere, enchanted, fairy tale, dragons and magic, epic fantasy",
        "negative": "mundane, realistic, modern, technology, sci-fi"
    },
    "industrial": {
        "modifiers": "metallic textures, gears, steampunk, mechanical, rivets and steel, factory aesthetic, brass and copper",
        "negative": "organic, natural, soft, delicate, pastel"
    },
    "cosmic": {
        "modifiers": "space elements, stars, galaxies, celestial, nebula colors, astronomical, deep space, cosmic wonder",
        "negative": "earthly, grounded, indoor, urban, mundane"
    },
    "abstract": {
        "modifiers": "bold geometric shapes, modern art, vibrant colors, artistic, contemporary art, expressive forms",
        "negative": "realistic, photographic, detailed, literal, figurative"
    },
    "elegant": {
        "modifiers": "sophisticated, gold accents, luxury aesthetic, premium feel, refined, ornate details, high-end",
        "negative": "cheap, casual, simple, rough, industrial"
    },
    # ========== BUSINESS STYLES (10) ==========
    "tech": {
        "modifiers": "digital interface, code elements, circuit patterns, blue glow, innovation, data visualization, futuristic UI",
        "negative": "organic, natural, handmade, vintage, rustic"
    },
    "food": {
        "modifiers": "appetizing colors, warm lighting, culinary art, fresh ingredients, gourmet presentation, food photography",
        "negative": "cold, sterile, industrial, technology, abstract"
    },
    "medical": {
        "modifiers": "clean clinical white, medical symbols, healing energy, trust and care, professional healthcare, wellness",
        "negative": "dirty, chaotic, scary, dark, fantasy"
    },
    "finance": {
        "modifiers": "wealth aesthetic, charts and graphs elements, gold and green, prosperity, financial growth, premium banking",
        "negative": "poor, cheap, casual, playful, childish"
    },
    "realestate": {
        "modifiers": "architectural elements, property showcase, home warmth, building silhouettes, modern architecture, luxury homes",
        "negative": "industrial, abandoned, rundown, fantasy, sci-fi"
    },
    "ecommerce": {
        "modifiers": "shopping elements, product display, vibrant commerce, deals and offers, retail aesthetic, colorful packaging",
        "negative": "minimalist, empty, industrial, corporate, muted"
    },
    "gaming": {
        "modifiers": "game UI elements, action dynamic, RGB lighting, epic scenes, gaming aesthetic, esports energy",
        "negative": "boring, static, corporate, professional, muted"
    },
    "education": {
        "modifiers": "books and knowledge, graduation elements, wisdom light, learning environment, academic, scholarly",
        "negative": "chaotic, entertainment, gaming, nightlife, party"
    },
    "travel": {
        "modifiers": "wanderlust aesthetic, landmarks, adventure vibes, passport stamps, exotic destinations, journey",
        "negative": "office, indoor, mundane, work, corporate"
    },
    "fitness": {
        "modifiers": "athletic energy, motion blur, gym aesthetic, strength and power, dynamic movement, sports action",
        "negative": "static, lazy, sedentary, slow, calm"
    },
}

DEFAULT_NEGATIVE = "low quality, blurry, deformed, ugly, bad anatomy, watermark, text, signature, amateur"

def create_workflow(style_name, style_data, custom_prompt, filename_prefix):
    """Create SDXL workflow with HSR style modifiers"""

    # Combine custom prompt with style modifiers
    full_prompt = f"{custom_prompt}, {style_data['modifiers']}, highly detailed, professional artwork, 4k"
    negative_prompt = f"{style_data['negative']}, {DEFAULT_NEGATIVE}"

    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": random.randint(0, 2**32-1),
                "steps": 35,
                "cfg": 7.5,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0]
            }
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": "sd_xl_base_1.0.safetensors"
            }
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": 1024,
                "height": 1024,
                "batch_size": 1
            }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": full_prompt,
                "clip": ["4", 1]
            }
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": negative_prompt,
                "clip": ["4", 1]
            }
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["3", 0],
                "vae": ["4", 2]
            }
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": f"SDXLx3/{filename_prefix}",
                "images": ["8", 0]
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
    # Default: generate all 20 styles
    styles_to_generate = list(STYLES.keys())
    custom_prompt = "premium NFT domain card for blockchain registry, digital ownership certificate"

    # Parse arguments
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg == "general":
            styles_to_generate = list(STYLES.keys())[:10]
            print("Generating GENERAL styles only (10)")
        elif arg == "business":
            styles_to_generate = list(STYLES.keys())[10:]
            print("Generating BUSINESS styles only (10)")
        elif arg in STYLES:
            styles_to_generate = [arg]
            print(f"Generating single style: {arg}")
        else:
            print(f"Unknown argument: {arg}")
            print("Usage: python generate-hsr-images.py [general|business|<style_name>]")
            return

    if len(sys.argv) > 2:
        custom_prompt = sys.argv[2]

    print(f"\n=== HSR SDXL Triple GPU Generation ===")
    print(f"Styles: {len(styles_to_generate)}")
    print(f"Prompt: {custom_prompt[:60]}...")
    print(f"Output: /home/localai/ComfyUI/output/SDXLx3/\n")

    # Queue all generations across 3 GPUs (round-robin)
    for i, style_name in enumerate(styles_to_generate):
        server = SERVERS[i % len(SERVERS)]
        style_data = STYLES[style_name]
        workflow = create_workflow(style_name, style_data, custom_prompt, style_name)

        print(f"[{i+1}/{len(styles_to_generate)}] {style_name}")
        print(f"      GPU: {SERVERS.index(server)} | {server}")

        result = queue_prompt(server, workflow)
        if result:
            print(f"      Queued: {result.get('prompt_id', 'OK')[:8]}...")
        else:
            print(f"      FAILED")

        time.sleep(0.3)

    print(f"\nAll {len(styles_to_generate)} generations queued!")
    print("Images saving to: /home/localai/ComfyUI/output/SDXLx3/")

if __name__ == "__main__":
    main()
