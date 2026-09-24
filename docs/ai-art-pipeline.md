# AI Art Generation Pipeline

## Overview

HSR generates unique artwork for each subdomain NFT using Stable Diffusion models via ComfyUI. Each TLD has a themed art style, and the subdomain name seeds the generation for uniqueness.

## Hardware

- **m3060** (192.0.2.97): 2x RTX 3060 12GB — primary render station
- **mosana1** (192.0.2.67): 2x RTX 3080 10GB — secondary render station
- Each GPU runs a separate ComfyUI instance
- 4 total instances for parallel generation

```
m3060 GPU0:   192.0.2.97:8188  (RTX 3060 12GB)
m3060 GPU1:   192.0.2.97:8189  (RTX 3060 12GB)
mosana1 GPU0: 192.0.2.67:8188  (RTX 3080 10GB)
mosana1 GPU1: 192.0.2.67:8189  (RTX 3080 10GB)
```

## Generation Logic

```
1. Generate unique seed from: subdomain + TLD + timestamp
2. Select prompt template based on TLD theme
3. Inject name characteristics into prompt
4. Send to ComfyUI API
5. Wait for generation (target <30 seconds)
6. Post-process: resize, optimize
7. Upload to IPFS via Pinata
8. Return CID for NFT metadata
```

## Quality Requirements

- **Resolution:** 512×512 minimum, 1024×1024 preferred
- **Format:** PNG (lossless for NFT)
- **Style:** Consistent per TLD (each TLD has a theme)
- **Uniqueness:** Seeded generation ensures no duplicates
- **Generation Time:** Target <30 seconds per image
- **Quantization:** W4A8 is acceptable for quality/speed tradeoff

## TLD Themes

| TLD | Theme | Art Style |
|-----|-------|-----------|
| `halcyon-domains` | Peaceful, ethereal | Soft gradients, nature |
| `cryptofans` | Crypto culture | Neon, cyber, coins |
| `web3mv` | Web3/metaverse | Digital, abstract |
| `crypto-ai` | AI + crypto fusion | Neural networks, data |
| `everquest` | Fantasy gaming | Medieval, magical |
| `wh40k` | Warhammer aesthetic | Gothic, grimdark |
| `flaremv` | Flare Network | Fire, energy, orange |
| `sparkmv` | Spark tokens | Electric, blue sparks |
| `flaredefi` | DeFi on Flare | Charts, finance, tech |

Additional TLDs should follow this pattern — define a theme and style before enabling.

## Models to Use

### Primary (Tested)
- **SDXL Base** — reliable baseline, handles 12GB VRAM well
- **Flux.1 Dev** — excellent prompt adherence, may need quantization
- **Juggernaut XL** — polished/professional look for premium domains

### Secondary Options
- **Flux.1 Schnell** — faster variant, good for high-volume
- **DreamShaper XL** — versatile all-rounder
- **SDXL Lightning/Turbo** — speed-optimized for bulk generation

## ComfyUI API Integration

```typescript
// Example: trigger generation
const response = await fetch(`${COMFYUI_URL}/prompt`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: workflowJSON,
    client_id: uniqueClientId
  })
});
```

- ComfyUI uses WebSocket for progress updates
- Poll `/history/{promptId}` for completion status
- Output images available at `/view?filename={name}&subfolder={folder}`

## Important Notes

- If render station is down, queue jobs and process later
- Never block the registration flow on art generation — mint first, update art async
- LoRAs can be added per-TLD for more specific styles
- Keep prompt templates in a config file, not hardcoded
- Log all generation parameters for reproducibility
