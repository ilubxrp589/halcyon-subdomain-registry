#!/usr/bin/env python3
"""
Parallel GGUF Q8 Generation - 3x GPUs simultaneously
Each GPU runs its own ComfyUI instance for maximum throughput
"""

import json
import requests
import time
import sys
import threading
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout.reconfigure(line_buffering=True)

# 3 ComfyUI instances - one per GPU
SERVERS = [
    {"url": "http://127.0.0.1:8188", "name": "GPU0"},
    {"url": "http://127.0.0.1:8189", "name": "GPU1"},
    {"url": "http://127.0.0.1:8190", "name": "GPU2"},
]

OUTPUT_DIR = Path("/home/localai/Desktop/FluxMultiGPU_Output")

# Load themes
with open("/home/localai/Desktop/HSR/scripts/themes_30.json") as f:
    themes_data = json.load(f)

themes = []
for category in ["business", "exotic"]:
    for key, theme in themes_data[category].items():
        themes.append({"id": key, "category": category, **theme})


def add_halcyon_watermark(image_path, theme_name, category):
    """Add Halcyon branding watermark"""
    img = Image.open(image_path).convert("RGBA")
    width, height = img.size
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    try:
        font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
        font_domain = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 48)
    except:
        font_title = ImageFont.load_default()
        font_small = font_title
        font_domain = font_title

    # Top gradient
    for y in range(110):
        alpha = int(230 * (110 - y) / 110)
        draw.rectangle([(0, y), (width, y+1)], fill=(10, 10, 20, alpha))

    # Bottom gradient
    for y in range(height - 140, height):
        alpha = int(240 * (y - (height - 140)) / 140)
        draw.rectangle([(0, y), (width, y+1)], fill=(10, 10, 20, alpha))

    # HALCYON title
    title = "HALCYON"
    bbox = draw.textbbox((0, 0), title, font=font_title)
    title_x = (width - (bbox[2] - bbox[0])) // 2
    draw.text((title_x, 18), title, font=font_title, fill=(255, 255, 255, 255))

    # Subtitle
    subtitle = "SUBDOMAIN REGISTRY"
    bbox = draw.textbbox((0, 0), subtitle, font=font_small)
    sub_x = (width - (bbox[2] - bbox[0])) // 2
    draw.text((sub_x, 55), subtitle, font=font_small, fill=(200, 200, 200, 200))

    # Domain name
    tlds = [".aiworktools", ".cryptofans", ".aisoftwaredesign"]
    theme_short = theme_name.lower().replace(" ", "")[:8]
    chosen_tld = tlds[hash(theme_name) % len(tlds)]
    domain_text = f"{theme_short}{chosen_tld}"
    bbox = draw.textbbox((0, 0), domain_text, font=font_domain)
    domain_x = (width - (bbox[2] - bbox[0])) // 2
    glow_color = (168, 85, 247) if category == "exotic" else (52, 211, 153)
    draw.text((domain_x, height - 100), domain_text, font=font_domain, fill=(255, 255, 255, 255))

    # Style label
    style_text = f"STYLE: {theme_name.upper()}"
    bbox = draw.textbbox((0, 0), style_text, font=font_small)
    style_x = (width - (bbox[2] - bbox[0])) // 2
    draw.text((style_x, height - 45), style_text, font=font_small, fill=(*glow_color, 255))

    # Category
    cat_text = f"[ {category.upper()} ]"
    bbox = draw.textbbox((0, 0), cat_text, font=font_small)
    cat_x = (width - (bbox[2] - bbox[0])) // 2
    draw.text((cat_x, height - 25), cat_text, font=font_small, fill=(180, 180, 180, 200))

    result = Image.alpha_composite(img, overlay)
    result = result.convert("RGB")
    result.save(image_path, "PNG")


def create_gguf_workflow(prompt_text, filename, seed, device="cuda:0"):
    """Create GGUF Q8 workflow - simple loader for single-GPU instances"""
    return {
        "prompt": {
            "1": {
                "class_type": "UnetLoaderGGUF",
                "inputs": {
                    "unet_name": "flux1-schnell-Q8_0.gguf"
                }
            },
            "2": {
                "class_type": "DualCLIPLoader",
                "inputs": {
                    "clip_name1": "t5xxl_fp8_e4m3fn.safetensors",
                    "clip_name2": "clip_l.safetensors",
                    "type": "flux"
                }
            },
            "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
            "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt_text, "clip": ["2", 0]}},
            "5": {
                "class_type": "ModelSamplingFlux",
                "inputs": {"model": ["1", 0], "max_shift": 1.15, "base_shift": 0.5, "width": 1024, "height": 1024}
            },
            "6": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["4", 0], "guidance": 1.0}},
            "7": {"class_type": "BasicGuider", "inputs": {"model": ["5", 0], "conditioning": ["6", 0]}},
            "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
            "9": {
                "class_type": "BasicScheduler",
                "inputs": {"model": ["5", 0], "scheduler": "simple", "steps": 4, "denoise": 1.0}
            },
            "10": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
            "11": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
            "12": {
                "class_type": "SamplerCustomAdvanced",
                "inputs": {
                    "noise": ["10", 0], "guider": ["7", 0], "sampler": ["8", 0],
                    "sigmas": ["9", 0], "latent_image": ["11", 0]
                }
            },
            "13": {"class_type": "VAEDecode", "inputs": {"samples": ["12", 0], "vae": ["3", 0]}},
            "14": {"class_type": "SaveImage", "inputs": {"images": ["13", 0], "filename_prefix": f"FluxMultiGPU/{filename}"}}
        }
    }


def wait_completion(server_url, prompt_id, timeout=300):
    start = time.time()
    while time.time() - start < timeout:
        try:
            history = requests.get(f"{server_url}/history/{prompt_id}", timeout=5).json()
            if prompt_id in history:
                return True
        except:
            pass
        time.sleep(1)
    return False


def generate_on_server(server, theme, seed):
    """Generate one image on specified server"""
    prompt_text = f"{theme['modifiers']}, masterpiece, 8k quality, highly detailed, cinematic lighting"
    filename = f"Parallel_{theme['id']}_{theme['name'].replace(' ', '_')}"

    workflow = create_gguf_workflow(prompt_text, filename, seed)

    start = time.time()
    try:
        resp = requests.post(f"{server['url']}/prompt", json=workflow, timeout=10).json()
        if "prompt_id" not in resp:
            return {"theme": theme["name"], "server": server["name"], "status": "error", "error": str(resp)}

        prompt_id = resp["prompt_id"]
        if wait_completion(server["url"], prompt_id):
            gen_time = time.time() - start

            # Find and watermark the file
            time.sleep(1)
            files = list(OUTPUT_DIR.glob(f"{filename}*.png"))
            if files:
                output_file = max(files, key=lambda f: f.stat().st_mtime)
                add_halcyon_watermark(str(output_file), theme["name"], theme["category"])
                return {"theme": theme["name"], "server": server["name"], "status": "success", "time": gen_time, "file": output_file.name}
            return {"theme": theme["name"], "server": server["name"], "status": "file_missing", "time": gen_time}
        return {"theme": theme["name"], "server": server["name"], "status": "timeout"}
    except Exception as e:
        return {"theme": theme["name"], "server": server["name"], "status": "error", "error": str(e)}


def main():
    print("=" * 60)
    print("PARALLEL GGUF Q8 GENERATION - 3x GPUs")
    print("=" * 60)
    print(f"Themes: {len(themes)}")
    print(f"Servers: {', '.join(s['name'] for s in SERVERS)}")
    print("=" * 60)

    # Check servers
    ready = 0
    for server in SERVERS:
        try:
            requests.get(f"{server['url']}/system_stats", timeout=3)
            print(f"  {server['name']}: READY")
            ready += 1
        except:
            print(f"  {server['name']}: NOT READY")

    if ready < 3:
        print(f"\nWARNING: Only {ready}/3 servers ready!")
    print()

    results = []
    start_time = time.time()

    # Process themes in parallel batches of 3
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {}
        theme_idx = 0
        import random

        for i, theme in enumerate(themes):
            server = SERVERS[i % 3]
            seed = random.randint(0, 2**32 - 1)
            future = executor.submit(generate_on_server, server, theme, seed)
            futures[future] = (i + 1, theme["name"], server["name"])

        for future in as_completed(futures):
            idx, name, server = futures[future]
            result = future.result()
            results.append(result)

            if result["status"] == "success":
                print(f"[{idx:02d}/30] {name} ({server}): {result['time']:.1f}s ✓", flush=True)
            else:
                print(f"[{idx:02d}/30] {name} ({server}): {result['status']}", flush=True)

    # Summary
    total_time = time.time() - start_time
    success = sum(1 for r in results if r["status"] == "success")

    print()
    print("=" * 60)
    print("PARALLEL GENERATION COMPLETE")
    print("=" * 60)
    print(f"Success: {success}/30")
    print(f"Total time: {total_time/60:.1f} minutes")
    print(f"Effective rate: {total_time/len(themes):.1f}s per image")
    print(f"Throughput: {len(themes)/(total_time/60):.1f} images/minute")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
