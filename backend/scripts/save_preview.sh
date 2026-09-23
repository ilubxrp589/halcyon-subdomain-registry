#!/bin/bash
# Save NFT preview images from the API
# Usage: ./save_preview.sh <subdomain> <tld> [theme] [output_file]
#
# Examples:
#   ./save_preview.sh x cryptofans divine /tmp/x-cryptofans.png
#   ./save_preview.sh hello cryptofans             # Uses default theme, saves to ./hello-cryptofans-preview.png

API_URL="${API_URL:-http://localhost:8000}"

subdomain="$1"
tld="$2"
theme="$3"
output="$4"

if [ -z "$subdomain" ] || [ -z "$tld" ]; then
    echo "Usage: $0 <subdomain> <tld> [theme] [output_file]"
    echo ""
    echo "Examples:"
    echo "  $0 x cryptofans divine /tmp/x-cryptofans.png"
    echo "  $0 hello cryptofans"
    echo ""
    echo "Available themes by tier:"
    echo "  ultra_premium (1 char): divine, imperial, mythical, crystalline, ethereal"
    echo "  premium (2 chars):      aurora, nebula, arcane, void, elemental"
    echo "  standard_plus (3 chars): stellar, ocean, circuit, forest, glacier"
    echo "  standard (4+ chars):    matrix, retro, geometric, industrial, pixel"
    exit 1
fi

# Default output filename
if [ -z "$output" ]; then
    output="./${subdomain}-${tld}-preview.png"
fi

# Build URL with optional theme
url="${API_URL}/api/v1/nft/preview-image/${subdomain}/${tld}"
if [ -n "$theme" ]; then
    url="${url}?theme=${theme}"
fi

echo "Generating preview for ${subdomain}.${tld}..."
if [ -n "$theme" ]; then
    echo "Theme: ${theme}"
fi
echo "Saving to: ${output}"
echo ""

# Make request and save image
http_code=$(curl -s -w "%{http_code}" -o "$output" "$url")

if [ "$http_code" = "200" ]; then
    # Verify it's actually a PNG file
    if file "$output" | grep -q "PNG image"; then
        echo "Success! Image saved to: ${output}"
        echo ""
        # Show metadata from headers if available
        seed=$(curl -sI "$url" 2>/dev/null | grep -i "X-NFT-Seed" | cut -d: -f2 | tr -d ' \r')
        tier=$(curl -sI "$url" 2>/dev/null | grep -i "X-NFT-Tier" | cut -d: -f2 | tr -d ' \r')
        if [ -n "$seed" ]; then
            echo "Seed: ${seed}"
        fi
        if [ -n "$tier" ]; then
            echo "Tier: ${tier}"
        fi
        ls -lh "$output"
    else
        echo "Error: Downloaded file is not a valid PNG image"
        echo "Response:"
        cat "$output"
        rm -f "$output"
        exit 1
    fi
else
    echo "Error: HTTP ${http_code}"
    if [ -f "$output" ]; then
        cat "$output"
        rm -f "$output"
    fi
    exit 1
fi
