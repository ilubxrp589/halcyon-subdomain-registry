import { NextRequest, NextResponse } from "next/server";

/**
 * FDC Verifier Proxy
 *
 * Proxies requests to the Flare FDC testnet verifier API to avoid CORS issues.
 * The verifier requires an X-API-KEY header which triggers browser preflight
 * requests that the verifier server doesn't support from cross-origin.
 */

const FDC_VERIFIER_BASE =
  "https://fdc-verifiers-testnet.flare.network/verifier/web2/Web2Json";
const FDC_API_KEY = "REDACTED";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${FDC_VERIFIER_BASE}/prepareRequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": FDC_API_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { error: "FDC verifier proxy error" },
      { status: 502 }
    );
  }
}
