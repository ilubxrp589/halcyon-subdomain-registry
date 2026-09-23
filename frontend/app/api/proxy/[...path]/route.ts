import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

// Whitelist of allowed API path prefixes
// Any path not starting with one of these will be rejected
const ALLOWED_PATH_PREFIXES = [
  "v2",
  "health",
  "search",
  "pricing",
  "stats",
  "domains",
  "dns",
  "hns",
  "nft",
  "auth",
  "marketplace",
  "tlds",
  "tld", // v2 staking: /tld/verify/:label, /tld/stake, etc.
  "resolve", // FLR address resolution
  "share", // Share preview links
  "share-domain", // Create share links for existing domains
  "share-preview", // Create share links for generated images
  "favorites", // User favorites for themes/styles
  "showcase", // Showcase images for register page gallery
  "watermark-styles", // Watermark style options for NFT customization
  "static", // Static assets (theme thumbnails, etc.)
  "alerts", // Domain availability watch alerts
  "notifications", // Domain renewal reminders
  "register", // Domain registration completion
  "profile", // Domain profile settings
  "features", // Feature flags
  "themes", // Theme data
  "staking", // V2 TLD staking (my-claims, status, fee)
  "rewards", // FTSO community reward claims
  "email", // Email notification preferences
  "api-keys", // Developer API keys
  "defaults", // User domain defaults
  // Admin paths are allowed but backend enforces auth
  "admin",
  "listener",
  "watcher",
  "price-sync",
];

// Paths that require special validation
const SENSITIVE_PATHS = [
  "admin",
  "listener",
  "watcher",
  "price-sync",
];

/**
 * Validate the request path against whitelist
 * Prevents directory traversal and unauthorized access
 */
function validatePath(pathSegments: string[]): { valid: boolean; error?: string } {
  if (!pathSegments || pathSegments.length === 0) {
    return { valid: false, error: "Empty path" };
  }

  const fullPath = pathSegments.join("/");

  // Check for directory traversal attempts
  if (fullPath.includes("..") || fullPath.includes("//")) {
    console.warn(`[Proxy] Directory traversal attempt blocked: ${fullPath}`);
    return { valid: false, error: "Invalid path" };
  }

  // Check for null bytes or other injection attempts
  if (fullPath.includes("\0") || fullPath.includes("%00")) {
    console.warn(`[Proxy] Null byte injection attempt blocked: ${fullPath}`);
    return { valid: false, error: "Invalid path" };
  }

  // Validate path starts with allowed prefix
  const firstSegment = pathSegments[0].toLowerCase();
  const isAllowed = ALLOWED_PATH_PREFIXES.some(
    (prefix) => firstSegment === prefix || firstSegment.startsWith(prefix + "/")
  );

  if (!isAllowed) {
    console.warn(`[Proxy] Blocked request to non-whitelisted path: ${fullPath}`);
    return { valid: false, error: "Path not allowed" };
  }

  return { valid: true };
}

/**
 * Common response headers for security
 */
function getSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  // Validate path
  const validation = validatePath(path);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error || "Forbidden" },
      { status: 403, headers: getSecurityHeaders() }
    );
  }

  // Detect v2 prefix and route to /api/v2/ instead of /api/v1/
  const isV2 = path[0] === "v2";
  const apiVersion = isV2 ? "v2" : "v1";
  const targetPath = isV2 ? path.slice(1).join("/") : path.join("/");
  const url = `${BACKEND_URL}/api/${apiVersion}/${targetPath}${request.nextUrl.search}`;

  try {
    // Forward Accept header so backend can return HTML for browser requests
    const acceptHeader = request.headers.get("accept") || "application/json";

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "Accept": acceptHeader,
      },
    });

    // Check if response is an image or other binary content
    const contentType = response.headers.get("content-type") || "";
    if (contentType.startsWith("image/")) {
      const imageBuffer = await response.arrayBuffer();
      const cacheControl = response.headers.get("cache-control") || "public, max-age=3600";
      return new NextResponse(imageBuffer, {
        status: response.status,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": cacheControl,
          ...getSecurityHeaders(),
        },
      });
    }

    // Pass through HTML responses directly (for email verify/unsubscribe pages)
    if (contentType.includes("text/html")) {
      const html = await response.text();
      return new NextResponse(html, {
        status: response.status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...getSecurityHeaders(),
        },
      });
    }

    const data = await response.json();
    return NextResponse.json(data, {
      status: response.status,
      headers: getSecurityHeaders(),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to backend" },
      { status: 502, headers: getSecurityHeaders() }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  // Validate path
  const validation = validatePath(path);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error || "Forbidden" },
      { status: 403, headers: getSecurityHeaders() }
    );
  }

  const isV2 = path[0] === "v2";
  const apiVersion = isV2 ? "v2" : "v1";
  const targetPath = isV2 ? path.slice(1).join("/") : path.join("/");
  const url = `${BACKEND_URL}/api/${apiVersion}/${targetPath}`;

  // Longer timeout for image generation endpoints (5 minutes)
  const isImageGeneration = targetPath.includes("flux-generate") || targetPath.includes("generate");
  const timeoutMs = isImageGeneration ? 300000 : 30000;

  try {
    const body = await request.json();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await response.json();
    return NextResponse.json(data, {
      status: response.status,
      headers: getSecurityHeaders(),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request timeout - image generation may still be in progress" },
        { status: 504, headers: getSecurityHeaders() }
      );
    }
    return NextResponse.json(
      { error: "Failed to connect to backend" },
      { status: 502, headers: getSecurityHeaders() }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  // Validate path
  const validation = validatePath(path);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error || "Forbidden" },
      { status: 403, headers: getSecurityHeaders() }
    );
  }

  const isV2 = path[0] === "v2";
  const apiVersion = isV2 ? "v2" : "v1";
  const targetPath = isV2 ? path.slice(1).join("/") : path.join("/");
  const url = `${BACKEND_URL}/api/${apiVersion}/${targetPath}`;

  try {
    const body = await request.json();
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, {
      status: response.status,
      headers: getSecurityHeaders(),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to backend" },
      { status: 502, headers: getSecurityHeaders() }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  // Validate path
  const validation = validatePath(path);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error || "Forbidden" },
      { status: 403, headers: getSecurityHeaders() }
    );
  }

  const isV2 = path[0] === "v2";
  const apiVersion = isV2 ? "v2" : "v1";
  const targetPath = isV2 ? path.slice(1).join("/") : path.join("/");
  const url = `${BACKEND_URL}/api/${apiVersion}/${targetPath}`;

  try {
    // DELETE requests may or may not have a body
    let body = null;
    try {
      body = await request.json();
    } catch {
      // No body is fine for DELETE
    }

    const fetchOptions: RequestInit = {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const data = await response.json();
    return NextResponse.json(data, {
      status: response.status,
      headers: getSecurityHeaders(),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to backend" },
      { status: 502, headers: getSecurityHeaders() }
    );
  }
}
