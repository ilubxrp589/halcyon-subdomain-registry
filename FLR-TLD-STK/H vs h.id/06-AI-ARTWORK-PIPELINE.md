# HSR — AI Artwork Pipeline

## What Makes HSR Unique

Every subdomain registration gets a unique, AI-generated artwork piece. No other domain registry offers this. The artwork becomes part of the NFT metadata, making each SLD visually unique and collectible.

## Architecture Overview

```
SLD Registered on Flare
  ↓ (event: ArtworkRequested)
Backend Listener catches event
  ↓
Render Queue (Redis/PostgreSQL)
  ↓
GPU Worker picks up job
  ↓
Stable Diffusion generates image
  ↓
Post-processing (resize, format)
  ↓
IPFS upload (pin to Pinata/Infura/local node)
  ↓
Backend calls contract: setArtwork(tokenId, ipfsCid)
  ↓
NFT metadata updated with artwork URL
```

## Prompt Generation Strategy

The AI prompt should be deterministic and derived from the domain name to ensure uniqueness while maintaining aesthetic quality.

### Approach: Seed-Based Generation

```javascript
// Generate a deterministic prompt from domain components
function generatePrompt(label, tldLabel) {
    const fullName = `${label}.${tldLabel}`;
    
    // Use hash of full domain as seed for style selection
    const hash = ethers.keccak256(ethers.toUtf8Bytes(fullName));
    const seed = parseInt(hash.slice(2, 10), 16);
    
    // Style palette
    const styles = [
        "ethereal digital landscape",
        "cyberpunk neon cityscape",
        "abstract geometric crystal formation",
        "cosmic nebula with bioluminescent elements",
        "steampunk mechanical garden",
        "underwater coral kingdom",
        "floating islands in aurora sky",
        "sacred geometry mandala",
        "retro-futuristic space station",
        "enchanted forest with luminous flora"
    ];
    
    // Color palettes
    const palettes = [
        "deep blues and gold",
        "neon pink and cyan",
        "earth tones with emerald accents",
        "purple and silver moonlight",
        "warm amber and crimson",
        "ice blue and white",
        "forest green and bronze",
        "sunset orange and indigo",
        "black and iridescent",
        "pastel rainbow gradients"
    ];
    
    const styleIndex = seed % styles.length;
    const paletteIndex = (seed >> 8) % palettes.length;
    
    const prompt = `A ${styles[styleIndex]} in ${palettes[paletteIndex]}, ` +
        `inspired by the word "${label}", ` +
        `digital art, highly detailed, 4k, masterpiece, ` +
        `with subtle text element "${fullName}" integrated naturally`;
    
    return {
        prompt,
        negativePrompt: "blurry, low quality, text errors, watermark, signature, deformed",
        seed: seed, // for reproducibility
        width: 1024,
        height: 1024,
        steps: 30,
        cfgScale: 7.5
    };
}
```

### Alternative: Theme per TLD

```javascript
// TLD owner can set a theme for all subdomains under their TLD
// Stored off-chain in HSR backend database

const tldThemes = {
    "coolname": {
        basePrompt: "futuristic cyberpunk scene",
        style: "neon digital art",
        requiredElements: ["circuit patterns", "holographic"],
    },
    "crypto": {
        basePrompt: "blockchain-inspired abstract art",
        style: "geometric crystal",
        requiredElements: ["interconnected nodes", "golden ratio"],
    }
};
```

## GPU Worker Service

### Stable Diffusion Setup

```bash
# On GPU render station (RTX 3060/3080)
# Using AUTOMATIC1111's stable-diffusion-webui or ComfyUI

# Option A: AUTOMATIC1111 with API mode
cd stable-diffusion-webui
./webui.sh --api --listen --port 7860

# Option B: ComfyUI with API
cd ComfyUI
python main.py --listen --port 8188

# Option C: Direct diffusers library
pip install diffusers transformers accelerate
```

### Worker Process

```javascript
// worker.js — runs on GPU machine
const { createClient } = require('redis');
const fetch = require('node-fetch');
const { create } = require('ipfs-http-client');

const REDIS_URL = process.env.REDIS_URL;
const SD_API_URL = 'http://localhost:7860'; // local Stable Diffusion API
const IPFS_API = 'https://ipfs.infura.io:5001';

async function processJob(job) {
    const { tokenId, label, tldLabel, sldNamehash } = job;
    
    // 1. Generate prompt
    const promptConfig = generatePrompt(label, tldLabel);
    
    // 2. Call Stable Diffusion API
    const response = await fetch(`${SD_API_URL}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: promptConfig.prompt,
            negative_prompt: promptConfig.negativePrompt,
            seed: promptConfig.seed,
            width: promptConfig.width,
            height: promptConfig.height,
            steps: promptConfig.steps,
            cfg_scale: promptConfig.cfgScale,
            sampler_name: "DPM++ 2M Karras",
            batch_size: 1
        })
    });
    
    const result = await response.json();
    const imageBase64 = result.images[0];
    
    // 3. Post-process (optional: resize, watermark, format)
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    
    // 4. Upload to IPFS
    const ipfs = create({ url: IPFS_API });
    const { cid } = await ipfs.add(imageBuffer);
    const ipfsCid = cid.toString();
    
    // 5. Pin to ensure persistence
    await ipfs.pin.add(cid);
    
    // 6. Update on-chain metadata
    await updateOnChainArtwork(tokenId, ipfsCid);
    
    // 7. Store in database for quick lookup
    await db.query(
        'UPDATE sld_artwork SET ipfs_cid = $1, status = $2 WHERE token_id = $3',
        [ipfsCid, 'complete', tokenId]
    );
    
    console.log(`Artwork complete: tokenId=${tokenId}, cid=${ipfsCid}`);
}

async function updateOnChainArtwork(tokenId, ipfsCid) {
    const tx = await hsrSldContract.setArtwork(tokenId, ipfsCid);
    await tx.wait();
}
```

### Queue Management

```javascript
// queue.js — Redis-based job queue
const Queue = require('bull');

const artworkQueue = new Queue('artwork-generation', REDIS_URL);

// Producer: called when registration event detected
async function queueArtworkJob(tokenId, label, tldLabel) {
    await artworkQueue.add({
        tokenId,
        label,
        tldLabel,
        timestamp: Date.now()
    }, {
        attempts: 3,           // retry on failure
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        timeout: 120000,       // 2 minute timeout
        removeOnComplete: true
    });
}

// Consumer: GPU worker processes jobs
artworkQueue.process(async (job) => {
    await processJob(job.data);
});

// Monitor queue health
artworkQueue.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err);
});
```

## NFT Metadata Service

### tokenURI Response

```json
{
    "name": "alice.coolname",
    "description": "Halcyon Subdomain Registry — alice.coolname on Flare Network",
    "image": "ipfs://QmXyz123abc456def789...",
    "external_url": "https://halcyon.domains/name/alice.coolname",
    "attributes": [
        {
            "trait_type": "TLD",
            "value": "coolname"
        },
        {
            "trait_type": "Label",
            "value": "alice"
        },
        {
            "trait_type": "Length",
            "display_type": "number",
            "value": 5
        },
        {
            "trait_type": "Registration Date",
            "display_type": "date",
            "value": 1706745600
        },
        {
            "trait_type": "Expiry Date",
            "display_type": "date",
            "value": 1738281600
        },
        {
            "trait_type": "Art Style",
            "value": "Cyberpunk Neon"
        },
        {
            "trait_type": "Artwork Generated",
            "value": "Yes"
        }
    ]
}
```

### Metadata Contract Implementation

```solidity
contract SldMetadataService {
    string public baseExternalUrl = "https://halcyon.domains/name/";
    
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        SldData memory data = hsrSld.getSldData(tokenId);
        string memory tldLabel = hsrTld.getLabel(data.parentNamehash);
        string memory fullName = string(abi.encodePacked(data.label, ".", tldLabel));
        
        // If artwork not yet generated, use placeholder
        string memory imageUrl;
        if (data.artworkGenerated) {
            imageUrl = string(abi.encodePacked("ipfs://", data.artworkIpfsHash));
        } else {
            imageUrl = string(abi.encodePacked(
                "https://api.halcyon.domains/placeholder/", fullName
            ));
        }
        
        // Build JSON metadata (on-chain or via API)
        // For gas efficiency, consider returning API URL that serves metadata
        return string(abi.encodePacked(
            "https://api.halcyon.domains/metadata/", 
            Strings.toString(tokenId)
        ));
    }
}
```

### Off-Chain Metadata API

```javascript
// GET /metadata/:tokenId
app.get('/metadata/:tokenId', async (req, res) => {
    const tokenId = req.params.tokenId;
    
    // Fetch on-chain data
    const sldData = await hsrSld.getSldData(tokenId);
    const tldLabel = await hsrTld.getLabel(sldData.parentNamehash);
    const fullName = `${sldData.label}.${tldLabel}`;
    
    // Get artwork from DB
    const artwork = await db.query(
        'SELECT ipfs_cid, status FROM sld_artwork WHERE token_id = $1',
        [tokenId]
    );
    
    const imageUrl = artwork?.ipfs_cid 
        ? `ipfs://${artwork.ipfs_cid}`
        : `https://api.halcyon.domains/placeholder/${fullName}`;
    
    const metadata = {
        name: fullName,
        description: `Halcyon Subdomain Registry — ${fullName} on Flare Network`,
        image: imageUrl,
        external_url: `https://halcyon.domains/name/${fullName}`,
        attributes: [
            { trait_type: "TLD", value: tldLabel },
            { trait_type: "Label", value: sldData.label },
            { trait_type: "Length", display_type: "number", value: sldData.label.length },
            { trait_type: "Registration Date", display_type: "date", value: Number(sldData.registrationTime) },
            { trait_type: "Expiry Date", display_type: "date", value: Number(sldData.expiryTime) },
            { trait_type: "Artwork Generated", value: artwork?.status === 'complete' ? "Yes" : "Pending" }
        ]
    };
    
    res.json(metadata);
});
```

## Placeholder Image

While artwork is being generated (typically 30-120 seconds), show a placeholder:

```
Options:
1. Branded gradient with domain text overlay
2. Loading animation SVG (on-chain)
3. Generic HSR logo with name
4. Deterministic color pattern from name hash (instant, no GPU)

Recommendation: Option 4 — generate a unique geometric pattern from the
domain name hash using SVG. This is instant, deterministic, and unique.
Can be generated on-chain or via API without GPU.
```

## IPFS Pinning Strategy

```
Primary: Self-hosted IPFS node (cheapest, most control)
Backup:  Pinata or nft.storage (redundancy)

Pin lifecycle:
  - Pin on artwork generation
  - Maintain pin while SLD is active
  - Optional: unpin after SLD expires + grace period
  - Consider: permanent pinning for all generated artwork (storage is cheap)

IPFS gateway for display:
  - Own gateway: https://ipfs.halcyon.domains/ipfs/{cid}
  - Public gateways: https://ipfs.io/ipfs/{cid} (fallback)
  - Pinata gateway: https://gateway.pinata.cloud/ipfs/{cid}
```

## Hardware Requirements

```
GPU Render Station:
  - RTX 3060 12GB: ~15-30 seconds per 1024x1024 image
  - RTX 3080 10GB: ~8-15 seconds per 1024x1024 image
  - Multiple GPUs can process queue in parallel

Model: Stable Diffusion XL (SDXL) recommended
  - Better quality than SD 1.5
  - 1024x1024 native resolution
  - Requires ~8GB VRAM minimum (fits RTX 3060)

Throughput estimate:
  - Single RTX 3060: ~120-240 images/hour
  - 3x RTX 3060 cluster: ~360-720 images/hour
  - More than enough for launch (unlikely to get 100+ registrations/hour initially)
```

## Future Enhancements

```
1. Artwork Regeneration
   - SLD owner can request new artwork (costs small fee)
   - Keeps history of all generated artworks

2. Custom Artwork Themes
   - TLD owner uploads LoRA or custom model for their TLD
   - All subdomains under that TLD share aesthetic

3. Animated Artwork
   - AnimateDiff or similar for animated NFTs
   - Higher tier pricing

4. Interactive Artwork
   - HTML-based NFTs with generative art (p5.js, three.js)
   - Stored on-chain or IPFS

5. Community Voting
   - Generate 3-4 options, SLD owner picks favorite
   - Or auto-select highest aesthetic score
```
