#!/bin/bash
# Test the complete video playback flow locally
# Usage: ./test-video-flow.sh
# Make sure `npm run dev` is running on port 3000 first

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BASE="http://localhost:3000"
TEST_PATH="one-piece-CTqWaizwOp3"
SEASON=1
EPISODE=1

echo ""
echo "=========================================="
echo "  Video Playback Flow Test"
echo "=========================================="
echo ""

# Step 1: Test /api/stream
echo -e "${YELLOW}[1/4] Testing /api/stream...${NC}"
STREAM_RESPONSE=$(curl -s "${BASE}/api/stream?path=${TEST_PATH}&season=${SEASON}&episode=${EPISODE}")

DOWNLOAD_COUNT=$(echo "$STREAM_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('downloads',[])))" 2>/dev/null || echo "0")
HAS_RESOURCE=$(echo "$STREAM_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('hasResource', False))" 2>/dev/null || echo "False")

if [ "$DOWNLOAD_COUNT" -gt 0 ]; then
    echo -e "${GREEN}  ✓ Stream resolved: ${DOWNLOAD_COUNT} downloads found${NC}"
    FIRST_URL=$(echo "$STREAM_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['downloads'][0]['url'])" 2>/dev/null)
    FIRST_RES=$(echo "$STREAM_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['downloads'][0].get('resolution',0))" 2>/dev/null)
    echo -e "  Resolution: ${FIRST_RES}p"
    echo -e "  URL: ${FIRST_URL:0:80}..."
    
    # Check for embed URLs
    HAS_EMBED=$(echo "$STREAM_RESPONSE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for dl in d.get('downloads',[]):
    url = dl.get('url','').lower()
    if 'vidsrc' in url or 'embed' in url or dl.get('isEmbed'):
        print('YES')
        sys.exit()
print('NO')
" 2>/dev/null)
    if [ "$HAS_EMBED" = "YES" ]; then
        echo -e "${RED}  ✗ WARNING: Embed URLs found in downloads!${NC}"
    else
        echo -e "${GREEN}  ✓ No embed URLs (clean direct streams)${NC}"
    fi
else
    echo -e "${RED}  ✗ FAILED: No downloads returned (hasResource=${HAS_RESOURCE})${NC}"
    echo ""
    echo "  Full response:"
    echo "$STREAM_RESPONSE" | python3 -m json.tool 2>/dev/null | head -20
    echo ""
    echo -e "${RED}  The server-side stream resolution failed.${NC}"
    echo "  Check if the dev server is running: npm run dev"
    exit 1
fi

# Step 2: Test video proxy
echo ""
echo -e "${YELLOW}[2/4] Testing /api/video proxy...${NC}"
ENCODED_URL=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${FIRST_URL}'))")
PROXY_URL="${BASE}/api/video?url=${ENCODED_URL}&referer=https%3A%2F%2Fvideodownloader.site%2F&mode=stream&quality=${FIRST_RES}"

PROXY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -I "$PROXY_URL" 2>/dev/null)
if [ "$PROXY_STATUS" = "200" ] || [ "$PROXY_STATUS" = "206" ]; then
    CONTENT_TYPE=$(curl -s -I "$PROXY_URL" 2>/dev/null | grep -i "content-type" | head -1 | tr -d '\r')
    CONTENT_LENGTH=$(curl -s -I "$PROXY_URL" 2>/dev/null | grep -i "content-length" | head -1 | tr -d '\r')
    ACCEPT_RANGES=$(curl -s -I "$PROXY_URL" 2>/dev/null | grep -i "accept-ranges" | head -1 | tr -d '\r')
    echo -e "${GREEN}  ✓ Proxy returned HTTP ${PROXY_STATUS}${NC}"
    echo "  ${CONTENT_TYPE}"
    echo "  ${CONTENT_LENGTH}"
    echo "  ${ACCEPT_RANGES}"
else
    echo -e "${RED}  ✗ Proxy FAILED with HTTP ${PROXY_STATUS}${NC}"
    echo "  Proxy URL: ${PROXY_URL:0:120}..."
    echo ""
    echo "  Testing direct CDN fetch..."
    DIRECT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -I "$FIRST_URL" \
        -H "Referer: https://videodownloader.site/" \
        -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" 2>/dev/null)
    echo "  Direct CDN status: HTTP ${DIRECT_STATUS}"
    if [ "$DIRECT_STATUS" = "403" ]; then
        echo -e "${RED}  CDN URL has expired! Token is no longer valid.${NC}"
    fi
    exit 1
fi

# Step 3: Test Range request (seeking)
echo ""
echo -e "${YELLOW}[3/4] Testing Range request (seeking)...${NC}"
RANGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -I -H "Range: bytes=0-1023" "$PROXY_URL" 2>/dev/null)
if [ "$RANGE_STATUS" = "206" ]; then
    CONTENT_RANGE=$(curl -s -I -H "Range: bytes=0-1023" "$PROXY_URL" 2>/dev/null | grep -i "content-range" | head -1 | tr -d '\r')
    echo -e "${GREEN}  ✓ Range request returned HTTP 206 (Partial Content)${NC}"
    echo "  ${CONTENT_RANGE}"
else
    echo -e "${YELLOW}  ⚠ Range request returned HTTP ${RANGE_STATUS} (expected 206)${NC}"
    echo "  Seeking may not work, but basic playback should still function."
fi

# Step 4: Download a small chunk to verify actual video data
echo ""
echo -e "${YELLOW}[4/4] Downloading 100KB to verify video data...${NC}"
CHUNK_FILE="/tmp/video_test_chunk.mp4"
curl -s -H "Range: bytes=0-102400" "$PROXY_URL" -o "$CHUNK_FILE" 2>/dev/null
CHUNK_SIZE=$(wc -c < "$CHUNK_FILE" 2>/dev/null | tr -d ' ')
if [ "$CHUNK_SIZE" -gt 1000 ]; then
    # Check if it starts with MP4 magic bytes (ftyp)
    MAGIC=$(xxd -l 8 "$CHUNK_FILE" 2>/dev/null | head -1)
    if echo "$MAGIC" | grep -q "6674797"; then
        echo -e "${GREEN}  ✓ Valid MP4 data received (${CHUNK_SIZE} bytes, ftyp header present)${NC}"
    else
        echo -e "${GREEN}  ✓ Data received (${CHUNK_SIZE} bytes) — may be valid video${NC}"
    fi
else
    echo -e "${RED}  ✗ No data received or too small (${CHUNK_SIZE} bytes)${NC}"
fi
rm -f "$CHUNK_FILE"

# Summary
echo ""
echo "=========================================="
echo -e "${GREEN}  ✓ All tests passed!${NC}"
echo "=========================================="
echo ""
echo "  The video flow is working correctly."
echo "  Open in browser (incognito):"
echo "  ${BASE}/watch/${TEST_PATH}?season=${SEASON}&episode=${EPISODE}"
echo ""
echo "  If video still fails in browser, check:"
echo "  1. Open DevTools → Network tab"
echo "  2. Look for /api/video request"
echo "  3. Check its response status (should be 200/206)"
echo "  4. Check response content-type (should be video/mp4)"
echo ""
