#!/usr/bin/env python3
"""
HSR Unified Image Generation - Flux Schnell GGUF Q8
Supports parallel generation across 3x GPUs

Usage:
    ./generate_hsr.py                    # Generate all themes from themes_30.json
    ./generate_hsr.py --themes 100       # Use themes_100.json
    ./generate_hsr.py --prompt "custom"  # Single custom prompt
    ./generate_hsr.py --count 10         # Generate first 10 themes only
    ./generate_hsr.py --no-watermark     # Skip watermark

Start servers first: ./start-flux-3x-parallel.sh
"""

import json
import requests
import time
import sys
import argparse
import random
import subprocess
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout.reconfigure(line_buffering=True)

# GPU Fan Control
FAN_HIGH = 100
FAN_LOW = 10
IDLE_TIMEOUT = 20
fan_control_running = False
last_gpu_activity = [time.time(), time.time(), time.time()]


def set_fan_speed(gpu_idx, speed):
    """Set fan speed for a specific GPU"""
    try:
        cmd = f"nvidia-settings -a '[gpu:{gpu_idx}]/GPUFanControlState=1' -a '[fan:{gpu_idx}]/GPUTargetFanSpeed={speed}' 2>/dev/null"
        subprocess.run(cmd, shell=True, capture_output=True, timeout=5)
    except:
        pass


def set_all_fans(speed):
    """Set all GPU fans"""
    for i in range(3):
        set_fan_speed(i, speed)


def fans_auto():
    """Reset fans to automatic control"""
    for i in range(3):
        try:
            subprocess.run(f"nvidia-settings -a '[gpu:{i}]/GPUFanControlState=0' 2>/dev/null",
                         shell=True, capture_output=True)
        except:
            pass


def fan_monitor_thread():
    """Background thread to monitor GPU activity and control fans"""
    global fan_control_running, last_gpu_activity
    current_speed = [FAN_LOW, FAN_LOW, FAN_LOW]

    while fan_control_running:
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=5
            )
            utils = [int(x.strip()) for x in result.stdout.strip().split('\n')]

            now = time.time()
            for i, util in enumerate(utils):
                if util > 5:
                    last_gpu_activity[i] = now
                    if current_speed[i] != FAN_HIGH:
                        set_fan_speed(i, FAN_HIGH)
                        current_speed[i] = FAN_HIGH
                else:
                    if now - last_gpu_activity[i] > IDLE_TIMEOUT and current_speed[i] != FAN_LOW:
                        set_fan_speed(i, FAN_LOW)
                        current_speed[i] = FAN_LOW

            time.sleep(2)
        except:
            time.sleep(5)


def start_fan_control():
    """Start fan control background thread"""
    global fan_control_running
    fan_control_running = True
    set_all_fans(FAN_HIGH)  # Start high for generation
    thread = threading.Thread(target=fan_monitor_thread, daemon=True)
    thread.start()
    return thread


def stop_fan_control():
    """Stop fan control and reset to auto"""
    global fan_control_running
    fan_control_running = False
    time.sleep(1)
    fans_auto()

# Configuration
SERVERS = [
    {"url": "http://127.0.0.1:8188", "name": "GPU0"},
    {"url": "http://127.0.0.1:8189", "name": "GPU1"},
    {"url": "http://127.0.0.1:8190", "name": "GPU2"},
]

SCRIPTS_DIR = Path(__file__).parent
OUTPUT_DIR = Path("/home/localai/ComfyUI/output")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def load_themes(theme_file):
    """Load themes from JSON file"""
    themes = []
    with open(theme_file) as f:
        data = json.load(f)

    # Handle different category structures
    for category in data.keys():
        if isinstance(data[category], dict):
            for key, theme in data[category].items():
                themes.append({
                    "id": key,
                    "category": category,
                    **theme
                })
    return themes


def add_halcyon_watermark(image_path, theme_name, category):
    """Add Halcyon branding watermark"""
    try:
        from PIL import Image, ImageDraw, ImageFont

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

        # Domain name - use theme to generate sample domain
        tlds = [".aiworktools", ".cryptofans", ".aisoftwaredesign"]
        theme_clean = theme_name.lower().replace(" ", "").replace("/", "").replace("&", "")[:12]
        chosen_tld = tlds[hash(theme_name) % len(tlds)]
        domain_text = f"{theme_clean}{chosen_tld}"

        bbox = draw.textbbox((0, 0), domain_text, font=font_domain)
        domain_x = (width - (bbox[2] - bbox[0])) // 2
        draw.text((domain_x, height - 100), domain_text, font=font_domain, fill=(255, 255, 255, 255))

        # Category color
        category_colors = {
            "business": (52, 211, 153),   # Green
            "exotic": (168, 85, 247),     # Purple
            "jobs": (34, 211, 238),       # Cyan
            "fantasy": (244, 63, 94),     # Rose
        }
        cat_color = category_colors.get(category, (168, 85, 247))

        # Style label
        style_short = theme_name[:20] + "..." if len(theme_name) > 20 else theme_name
        style_text = f"{style_short.upper()}"
        bbox = draw.textbbox((0, 0), style_text, font=font_small)
        style_x = (width - (bbox[2] - bbox[0])) // 2
        draw.text((style_x, height - 45), style_text, font=font_small, fill=(*cat_color, 255))

        # Category badge
        cat_text = f"[ {category.upper()} ]"
        bbox = draw.textbbox((0, 0), cat_text, font=font_small)
        cat_x = (width - (bbox[2] - bbox[0])) // 2
        draw.text((cat_x, height - 25), cat_text, font=font_small, fill=(180, 180, 180, 200))

        result = Image.alpha_composite(img, overlay)
        result = result.convert("RGB")
        result.save(image_path, "PNG")
        return True
    except Exception as e:
        print(f"    Watermark error: {e}", flush=True)
        return False


def create_workflow(prompt_text, filename, seed):
    """Create Flux Schnell GGUF Q8 workflow"""
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
            "3": {
                "class_type": "VAELoader",
                "inputs": {"vae_name": "ae.safetensors"}
            },
            "4": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": prompt_text, "clip": ["2", 0]}
            },
            "5": {
                "class_type": "ModelSamplingFlux",
                "inputs": {
                    "model": ["1", 0],
                    "max_shift": 1.15,
                    "base_shift": 0.5,
                    "width": 1024,
                    "height": 1024
                }
            },
            "6": {
                "class_type": "FluxGuidance",
                "inputs": {"conditioning": ["4", 0], "guidance": 1.0}
            },
            "7": {
                "class_type": "BasicGuider",
                "inputs": {"model": ["5", 0], "conditioning": ["6", 0]}
            },
            "8": {
                "class_type": "KSamplerSelect",
                "inputs": {"sampler_name": "euler"}
            },
            "9": {
                "class_type": "BasicScheduler",
                "inputs": {
                    "model": ["5", 0],
                    "scheduler": "simple",
                    "steps": 4,
                    "denoise": 1.0
                }
            },
            "10": {
                "class_type": "RandomNoise",
                "inputs": {"noise_seed": seed}
            },
            "11": {
                "class_type": "EmptySD3LatentImage",
                "inputs": {"width": 1024, "height": 1024, "batch_size": 1}
            },
            "12": {
                "class_type": "SamplerCustomAdvanced",
                "inputs": {
                    "noise": ["10", 0],
                    "guider": ["7", 0],
                    "sampler": ["8", 0],
                    "sigmas": ["9", 0],
                    "latent_image": ["11", 0]
                }
            },
            "13": {
                "class_type": "VAEDecode",
                "inputs": {"samples": ["12", 0], "vae": ["3", 0]}
            },
            "14": {
                "class_type": "SaveImage",
                "inputs": {
                    "images": ["13", 0],
                    "filename_prefix": f"HSR/{filename}"
                }
            }
        }
    }


def wait_completion(server_url, prompt_id, timeout=300):
    """Wait for generation to complete"""
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


def generate_on_server(server, theme, seed, add_watermark=True):
    """Generate one image on specified server"""
    prompt_text = f"{theme['modifiers']}, masterpiece, 8k quality, highly detailed, cinematic lighting, professional artwork"

    # Clean filename
    name_clean = theme['name'].replace(" ", "_").replace("/", "-").replace("&", "and")[:30]
    filename = f"{theme['id']}_{name_clean}"

    workflow = create_workflow(prompt_text, filename, seed)

    start = time.time()
    try:
        resp = requests.post(f"{server['url']}/prompt", json=workflow, timeout=10).json()
        if "prompt_id" not in resp:
            return {
                "theme": theme["name"],
                "server": server["name"],
                "status": "error",
                "error": str(resp)
            }

        prompt_id = resp["prompt_id"]
        if wait_completion(server["url"], prompt_id):
            gen_time = time.time() - start
            time.sleep(1)  # Wait for file write

            # Find output file
            output_subdir = OUTPUT_DIR / "HSR"
            output_subdir.mkdir(exist_ok=True)
            files = list(output_subdir.glob(f"{filename}*.png"))

            if files:
                output_file = max(files, key=lambda f: f.stat().st_mtime)
                if add_watermark:
                    add_halcyon_watermark(str(output_file), theme["name"], theme["category"])
                return {
                    "theme": theme["name"],
                    "server": server["name"],
                    "status": "success",
                    "time": gen_time,
                    "file": output_file.name
                }
            return {
                "theme": theme["name"],
                "server": server["name"],
                "status": "file_missing",
                "time": gen_time
            }
        return {
            "theme": theme["name"],
            "server": server["name"],
            "status": "timeout"
        }
    except Exception as e:
        return {
            "theme": theme["name"],
            "server": server["name"],
            "status": "error",
            "error": str(e)
        }


def generate_custom(servers, prompt, count=1, add_watermark=False):
    """Generate from a custom prompt"""
    results = []

    for i in range(count):
        server = servers[i % len(servers)]
        seed = random.randint(0, 2**32 - 1)

        theme = {
            "id": f"custom_{i+1:03d}",
            "name": "Custom",
            "category": "custom",
            "modifiers": prompt
        }

        print(f"[{i+1}/{count}] Generating on {server['name']}...", flush=True)
        result = generate_on_server(server, theme, seed, add_watermark)
        results.append(result)

        if result["status"] == "success":
            print(f"  Done: {result['time']:.1f}s - {result.get('file', 'unknown')}", flush=True)
        else:
            print(f"  {result['status']}: {result.get('error', '')}", flush=True)

    return results


def main():
    parser = argparse.ArgumentParser(description="HSR Image Generation - Flux Schnell GGUF Q8")
    parser.add_argument("--themes", type=str, default="30", help="Theme file: 30, 100, or path to JSON")
    parser.add_argument("--prompt", type=str, help="Custom prompt (overrides themes)")
    parser.add_argument("--count", type=int, help="Number of images to generate")
    parser.add_argument("--no-watermark", action="store_true", help="Skip watermark")
    parser.add_argument("--no-fan-control", action="store_true", help="Disable automatic fan control")
    parser.add_argument("--output", type=str, help="Output subdirectory name")
    args = parser.parse_args()

    # Start fan control unless disabled
    if not args.no_fan_control:
        print("Starting GPU fan control (100% during load, 10% after 20s idle)", flush=True)
        start_fan_control()

    print("=" * 70, flush=True)
    print("  HSR IMAGE GENERATION - Flux Schnell GGUF Q8", flush=True)
    print("=" * 70, flush=True)

    # Check which servers are ready
    ready_servers = []
    for server in SERVERS:
        try:
            requests.get(f"{server['url']}/system_stats", timeout=3)
            print(f"  {server['name']}: READY", flush=True)
            ready_servers.append(server)
        except:
            print(f"  {server['name']}: NOT READY", flush=True)

    if not ready_servers:
        print("\nERROR: No ComfyUI servers running!", flush=True)
        print("Start with: ./start-flux-3x-parallel.sh", flush=True)
        sys.exit(1)

    print(f"\n  Using {len(ready_servers)} GPU(s)", flush=True)
    print("=" * 70, flush=True)

    add_watermark = not args.no_watermark

    # Custom prompt mode
    if args.prompt:
        count = args.count or 1
        print(f"\nCustom prompt: {args.prompt[:60]}...", flush=True)
        print(f"Count: {count}", flush=True)
        print()

        results = generate_custom(ready_servers, args.prompt, count, add_watermark)
        success = sum(1 for r in results if r["status"] == "success")
        print(f"\nSuccess: {success}/{count}", flush=True)
        if not args.no_fan_control:
            stop_fan_control()
        return

    # Theme mode
    if args.themes == "30":
        theme_file = SCRIPTS_DIR / "themes_30.json"
    elif args.themes == "100":
        theme_file = SCRIPTS_DIR / "themes_100.json"
    else:
        theme_file = Path(args.themes)

    if not theme_file.exists():
        print(f"ERROR: Theme file not found: {theme_file}", flush=True)
        sys.exit(1)

    themes = load_themes(theme_file)

    if args.count:
        themes = themes[:args.count]

    print(f"\n  Theme file: {theme_file.name}", flush=True)
    print(f"  Themes: {len(themes)}", flush=True)
    print(f"  Watermark: {'Yes' if add_watermark else 'No'}", flush=True)
    print(f"  Output: {OUTPUT_DIR}/HSR/", flush=True)
    print("=" * 70, flush=True)
    print()

    results = []
    start_time = time.time()
    completed = 0
    total = len(themes)

    # Parallel generation
    with ThreadPoolExecutor(max_workers=len(ready_servers)) as executor:
        futures = {}

        for i, theme in enumerate(themes):
            server = ready_servers[i % len(ready_servers)]
            seed = random.randint(0, 2**32 - 1)
            future = executor.submit(generate_on_server, server, theme, seed, add_watermark)
            futures[future] = (i + 1, theme["name"], server["name"], theme["category"])

        for future in as_completed(futures):
            idx, name, server, category = futures[future]
            result = future.result()
            results.append(result)
            completed += 1

            # Category emoji
            cat_emoji = {"business": "💼", "exotic": "🎨", "jobs": "👷", "fantasy": "🌹"}.get(category, "📦")

            if result["status"] == "success":
                print(f"[{completed:03d}/{total}] {cat_emoji} {name[:25]:<25} ({server}): {result['time']:.1f}s ✓", flush=True)
            else:
                print(f"[{completed:03d}/{total}] {cat_emoji} {name[:25]:<25} ({server}): {result['status']} ✗", flush=True)

    # Summary
    total_time = time.time() - start_time
    success = sum(1 for r in results if r["status"] == "success")

    print()
    print("=" * 70, flush=True)
    print("  GENERATION COMPLETE", flush=True)
    print("=" * 70, flush=True)
    print(f"  Success:     {success}/{total}", flush=True)
    print(f"  Total time:  {total_time/60:.1f} minutes", flush=True)
    print(f"  Rate:        {total_time/total:.1f}s per image", flush=True)
    print(f"  Throughput:  {total/(total_time/60):.1f} images/minute", flush=True)
    print(f"  Output:      {OUTPUT_DIR}/HSR/", flush=True)
    print("=" * 70, flush=True)

    # Stop fan control
    if not args.no_fan_control:
        print("\nResetting fan control to auto...", flush=True)
        stop_fan_control()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nInterrupted. Resetting fans to auto...", flush=True)
        stop_fan_control()
    except Exception as e:
        print(f"\nError: {e}", flush=True)
        stop_fan_control()
        raise
