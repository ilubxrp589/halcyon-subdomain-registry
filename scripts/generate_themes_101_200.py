#!/usr/bin/env python3
"""
Generate Themes 101-200 - Jobs + Fantasy
Parallel GGUF Q8 across 3 GPUs
"""

import json
import requests
import time
import sys
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout.reconfigure(line_buffering=True)

SERVERS = [
    {"url": "http://127.0.0.1:8188", "name": "GPU0"},
    {"url": "http://127.0.0.1:8189", "name": "GPU1"},
    {"url": "http://127.0.0.1:8190", "name": "GPU2"},
]

OUTPUT_DIR = Path("/home/localai/Desktop/FluxMultiGPU_Output/FluxMultiGPU_Output/100 themed/101-200")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Symlink for ComfyUI
import os
comfy_link = Path("/home/localai/ComfyUI/output/FluxMultiGPU/101_200_themed")
comfy_link.parent.mkdir(exist_ok=True)
if not comfy_link.exists():
    try:
        os.symlink(OUTPUT_DIR, comfy_link)
    except:
        pass

print("Loading themes 101-200 (jobs + fantasy)...", flush=True)
with open("/home/localai/Desktop/HSR/scripts/themes_100.json") as f:
    themes_data = json.load(f)

themes = []
for category in ["jobs", "fantasy"]:
    if category in themes_data:
        for key, theme in themes_data[category].items():
            themes.append({"id": key, "category": category, **theme})

print(f"Loaded {len(themes)} themes", flush=True)


def add_halcyon_watermark(image_path, theme_name, category):
    """Add Halcyon branding watermark"""
    try:
        img = Image.open(image_path).convert("RGBA")
        width, height = img.size
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        try:
            font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
            font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
            font_domain = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32)
        except:
            font_title = ImageFont.load_default()
            font_small = font_title
            font_domain = font_title

        # Top gradient
        for y in range(90):
            alpha = int(200 * (90 - y) / 90)
            draw.rectangle([(0, y), (width, y+1)], fill=(10, 10, 20, alpha))

        # Bottom gradient
        for y in range(height - 110, height):
            alpha = int(220 * (y - (height - 110)) / 110)
            draw.rectangle([(0, y), (width, y+1)], fill=(10, 10, 20, alpha))

        # HALCYON title
        title = "HALCYON"
        bbox = draw.textbbox((0, 0), title, font=font_title)
        title_x = (width - (bbox[2] - bbox[0])) // 2
        draw.text((title_x, 15), title, font=font_title, fill=(255, 255, 255, 255))

        # Subtitle
        subtitle = "SUBDOMAIN REGISTRY"
        bbox = draw.textbbox((0, 0), subtitle, font=font_small)
        sub_x = (width - (bbox[2] - bbox[0])) // 2
        draw.text((sub_x, 48), subtitle, font=font_small, fill=(200, 200, 200, 200))

        # Domain name at bottom
        tlds = [".aiworktools", ".cryptofans", ".aisoftwaredesign"]
        theme_clean = theme_name.lower().replace(" ", "").replace("/", "").replace("&", "")[:12]
        chosen_tld = tlds[hash(theme_name) % len(tlds)]
        domain_text = f"{theme_clean}{chosen_tld}"

        bbox = draw.textbbox((0, 0), domain_text, font=font_domain)
        domain_x = (width - (bbox[2] - bbox[0])) // 2
        draw.text((domain_x, height - 70), domain_text, font=font_domain, fill=(255, 255, 255, 255))

        # Category color
        if category == "fantasy":
            cat_color = (244, 63, 94)   # Rose
        elif category == "jobs":
            cat_color = (34, 211, 238)  # Cyan
        else:
            cat_color = (168, 85, 247)  # Purple

        # Style label
        style_short = theme_name[:20] + "..." if len(theme_name) > 20 else theme_name
        style_text = f"{style_short.upper()}"
        bbox = draw.textbbox((0, 0), style_text, font=font_small)
        style_x = (width - (bbox[2] - bbox[0])) // 2
        draw.text((style_x, height - 35), style_text, font=font_small, fill=(*cat_color, 255))

        result = Image.alpha_composite(img, overlay)
        result = result.convert("RGB")
        result.save(image_path, "PNG")
        return True
    except Exception as e:
        print(f"    Watermark error: {e}", flush=True)
        return False


def create_workflow(prompt_text, filename, seed):
    """Create GGUF Q8 workflow"""
    return {
        "prompt": {
            "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "flux1-schnell-Q8_0.gguf"}},
            "2": {"class_type": "DualCLIPLoader", "inputs": {
                "clip_name1": "t5xxl_fp8_e4m3fn.safetensors",
                "clip_name2": "clip_l.safetensors", "type": "flux"}},
            "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
            "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt_text, "clip": ["2", 0]}},
            "5": {"class_type": "ModelSamplingFlux", "inputs": {
                "model": ["1", 0], "max_shift": 1.15, "base_shift": 0.5, "width": 1024, "height": 1024}},
            "6": {"class_type": "FluxGuidance", "inputs": {"conditioning": ["4", 0], "guidance": 1.0}},
            "7": {"class_type": "BasicGuider", "inputs": {"model": ["5", 0], "conditioning": ["6", 0]}},
            "8": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
            "9": {"class_type": "BasicScheduler", "inputs": {
                "model": ["5", 0], "scheduler": "simple", "steps": 4, "denoise": 1.0}},
            "10": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
            "11": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
            "12": {"class_type": "SamplerCustomAdvanced", "inputs": {
                "noise": ["10", 0], "guider": ["7", 0], "sampler": ["8", 0],
                "sigmas": ["9", 0], "latent_image": ["11", 0]}},
            "13": {"class_type": "VAEDecode", "inputs": {"samples": ["12", 0], "vae": ["3", 0]}},
            "14": {"class_type": "SaveImage", "inputs": {
                "images": ["13", 0], "filename_prefix": f"FluxMultiGPU/101_200_themed/{filename}"}}
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


def generate_on_server(server, theme, idx, seed):
    """Generate one image on specified server"""
    prompt_text = f"{theme['modifiers']}, masterpiece, 8k quality, highly detailed, cinematic lighting, professional artwork"

    name_clean = theme['name'].replace(" ", "_").replace("/", "-").replace("&", "and")[:30]
    filename = f"{theme['id']}_{name_clean}"

    workflow = create_workflow(prompt_text, filename, seed)

    start = time.time()
    try:
        resp = requests.post(f"{server['url']}/prompt", json=workflow, timeout=10).json()
        if "prompt_id" not in resp:
            return {"idx": idx, "theme": theme["name"], "server": server["name"], "status": "error", "error": str(resp)}

        if wait_completion(server["url"], resp["prompt_id"]):
            gen_time = time.time() - start
            time.sleep(1)

            # Find and watermark
            files = list(OUTPUT_DIR.glob(f"{filename}*.png"))
            if files:
                output_file = max(files, key=lambda f: f.stat().st_mtime)
                add_halcyon_watermark(str(output_file), theme["name"], theme["category"])
                return {"idx": idx, "theme": theme["name"], "server": server["name"], "status": "success", "time": gen_time}
            return {"idx": idx, "theme": theme["name"], "server": server["name"], "status": "file_missing", "time": gen_time}
        return {"idx": idx, "theme": theme["name"], "server": server["name"], "status": "timeout"}
    except Exception as e:
        return {"idx": idx, "theme": theme["name"], "server": server["name"], "status": "error", "error": str(e)}


def main():
    print("=" * 70, flush=True)
    print("  THEMES 101-200 PARALLEL GENERATION - GGUF Q8 x3 GPUs", flush=True)
    print("=" * 70, flush=True)

    jobs_count = sum(1 for t in themes if t["category"] == "jobs")
    fantasy_count = sum(1 for t in themes if t["category"] == "fantasy")

    print(f"  Jobs themes:     {jobs_count}", flush=True)
    print(f"  Fantasy themes:  {fantasy_count}", flush=True)
    print(f"  Total:           {len(themes)}", flush=True)
    print(f"  Output: {OUTPUT_DIR}", flush=True)
    print("=" * 70, flush=True)

    # Check servers
    ready_servers = []
    for server in SERVERS:
        try:
            requests.get(f"{server['url']}/system_stats", timeout=3)
            print(f"  {server['name']}: READY", flush=True)
            ready_servers.append(server)
        except:
            print(f"  {server['name']}: NOT READY", flush=True)

    if len(ready_servers) == 0:
        print("\nERROR: No servers ready! Start with: start-flux-3x-parallel.sh", flush=True)
        sys.exit(1)

    print(f"\n  Using {len(ready_servers)} GPU(s)", flush=True)
    print("=" * 70, flush=True)
    print()

    results = []
    start_time = time.time()
    completed = 0
    total = len(themes)

    with ThreadPoolExecutor(max_workers=len(ready_servers)) as executor:
        futures = {}

        for i, theme in enumerate(themes):
            server = ready_servers[i % len(ready_servers)]
            seed = random.randint(0, 2**32 - 1)
            future = executor.submit(generate_on_server, server, theme, i + 1, seed)
            futures[future] = (i + 1, theme["name"], server["name"], theme["category"])

        for future in as_completed(futures):
            idx, name, server, category = futures[future]
            result = future.result()
            results.append(result)
            completed += 1

            cat_symbol = "🌹" if category == "fantasy" else "👷"
            if result["status"] == "success":
                print(f"[{completed:03d}/{total}] {cat_symbol} {name[:25]:<25} ({server}): {result['time']:.1f}s ✓", flush=True)
            else:
                print(f"[{completed:03d}/{total}] {cat_symbol} {name[:25]:<25} ({server}): {result['status']} ✗", flush=True)

    # Summary
    total_time = time.time() - start_time
    success = sum(1 for r in results if r["status"] == "success")
    jobs_ok = sum(1 for r in results if r["status"] == "success" and any(t["category"] == "jobs" and t["name"] == r["theme"] for t in themes))
    fantasy_ok = success - jobs_ok

    print()
    print("=" * 70, flush=True)
    print("  GENERATION COMPLETE", flush=True)
    print("=" * 70, flush=True)
    print(f"  Total Success:    {success}/{total}", flush=True)
    print(f"  Jobs themes:      {jobs_ok}/50", flush=True)
    print(f"  Fantasy themes:   {fantasy_ok}/50", flush=True)
    print(f"  Total time:       {total_time/60:.1f} minutes", flush=True)
    print(f"  Effective rate:   {total_time/total:.1f}s per image", flush=True)
    print(f"  Throughput:       {total/(total_time/60):.1f} images/minute", flush=True)
    print(f"  Output folder:    {OUTPUT_DIR}", flush=True)
    print("=" * 70, flush=True)


if __name__ == "__main__":
    main()
