import { NextRequest, NextResponse } from "next/server";

/**
 * RPC Proxy for Coston2/Flare
 *
 * Solves CORS issue: browsers block direct RPC calls to coston2-api.flare.network
 * when the page is served from a non-standard origin (e.g., http://192.0.2.39:3000).
 * This proxy forwards JSON-RPC requests through our Next.js server.
 *
 * Only allows read-only methods — no signing/sending transactions through this proxy.
 * Includes fallback RPCs and HTML response handling for Cloudflare challenges.
 */

const COSTON2_RPCS = [
  "https://coston2-api.flare.network/ext/C/rpc",
  "https://coston2.enosys.global/ext/C/rpc",
  "https://rpc.ankr.com/flare_coston2",
];
const FLARE_RPCS = [
  "https://flare-api.flare.network/ext/C/rpc",
  "https://rpc.ankr.com/flare",
];

// Whitelist of read-only JSON-RPC methods allowed through the proxy
const ALLOWED_METHODS = new Set([
  "eth_getBalance",
  "eth_call",
  "eth_getTransactionCount",
  "eth_getCode",
  "eth_getStorageAt",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  "eth_chainId",
  "net_version",
  "eth_gasPrice",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_maxPriorityFeePerGas",
]);

async function tryRpc(url: string, body: string): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
    });

    const text = await response.text();

    // Detect HTML responses (Cloudflare challenge, rate limit page, etc.)
    if (text.startsWith("<") || text.includes("<!doctype") || text.includes("<!DOCTYPE")) {
      return { ok: false, error: `HTML response from ${url} (status ${response.status})` };
    }

    try {
      const data = JSON.parse(text);
      return { ok: true, data };
    } catch {
      return { ok: false, error: `Invalid JSON from ${url}: ${text.slice(0, 100)}` };
    }
  } catch (err) {
    return { ok: false, error: `Fetch failed for ${url}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// Simple in-memory cache for eth_blockNumber (avoids hammering RPCs)
let blockNumberCache: { value: unknown; ts: number } | null = null;
const BLOCK_CACHE_MS = 3000; // 3 seconds

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Support single requests and batch requests
    const requests = Array.isArray(body) ? body : [body];

    // Validate all methods are read-only
    for (const req of requests) {
      if (!req.method || !ALLOWED_METHODS.has(req.method)) {
        return NextResponse.json(
          { error: `Method not allowed: ${req.method}` },
          { status: 403 }
        );
      }
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    };

    // Determine target RPCs based on optional chainId query param
    const chainId = request.nextUrl.searchParams.get("chainId");
    const rpcs = chainId === "14" ? FLARE_RPCS : COSTON2_RPCS;

    // Return cached eth_blockNumber if fresh (reduces RPC spam from polling)
    if (!Array.isArray(body) && body.method === "eth_blockNumber" && blockNumberCache && Date.now() - blockNumberCache.ts < BLOCK_CACHE_MS) {
      const cached = blockNumberCache.value as Record<string, unknown>;
      return NextResponse.json({ ...cached, id: body.id }, { headers: corsHeaders });
    }

    const bodyStr = JSON.stringify(body);

    // Try each RPC in order until one succeeds
    const errors: string[] = [];
    for (const rpcUrl of rpcs) {
      const result = await tryRpc(rpcUrl, bodyStr);
      if (result.ok) {
        // Cache eth_blockNumber responses
        if (!Array.isArray(body) && body.method === "eth_blockNumber") {
          blockNumberCache = { value: result.data, ts: Date.now() };
        }
        return NextResponse.json(result.data, { headers: corsHeaders });
      }
      errors.push(result.error);
    }

    // All RPCs failed — retry primary once more after a short delay
    await new Promise((r) => setTimeout(r, 500));
    const retry = await tryRpc(rpcs[0], bodyStr);
    if (retry.ok) {
      if (!Array.isArray(body) && body.method === "eth_blockNumber") {
        blockNumberCache = { value: retry.data, ts: Date.now() };
      }
      return NextResponse.json(retry.data, { headers: corsHeaders });
    }
    errors.push(retry.error);

    console.error("[RPC Proxy] All RPCs failed:", errors);
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "All RPC endpoints unavailable" }, id: null },
      { status: 502, headers: corsHeaders }
    );
  } catch (err) {
    console.error("[RPC Proxy Error]", err);
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "RPC proxy error" }, id: null },
      { status: 502, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
