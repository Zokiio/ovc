#!/bin/bash
# Script to create all GitHub issues from markdown files
# Requires: GitHub CLI (gh) to be installed and authenticated

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed."
    echo "Please install it from: https://cli.github.com/"
    echo ""
    echo "Alternatively, you can create issues manually by copying the content"
    echo "from each markdown file into GitHub's issue creation form."
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub CLI."
    echo "Please run: gh auth login"
    exit 1
fi

echo "===================================="
echo "Creating GitHub Issues"
echo "===================================="
echo ""

# Array of issues: number:title:labels:filename
declare -a issues=(
  "01:Add UDP Encryption (DTLS or Custom):security,enhancement,high-priority:issue-01-udp-encryption.md"
  "02:Implement NAT Traversal (STUN/UPnP):networking,enhancement,high-priority:issue-02-nat-traversal.md"
  "03:Implement Token-Based Authentication:security,enhancement:issue-03-token-authentication.md"
  "04:Add Packet Loss Concealment (PLC):enhancement,audio-quality:issue-04-packet-loss-concealment.md"
  "05:Create Browser-Based WebRTC Fallback Client:enhancement,feature:issue-05-webrtc-fallback.md"
  "06:Add Comprehensive Test Coverage:testing,enhancement:issue-06-test-coverage.md"
  "07:Implement Rate Limiting and DoS Protection:security,enhancement:issue-07-rate-limiting.md"
  "08:Add Admin/Moderation Features:enhancement,feature:issue-08-admin-moderation.md"
  "09:Implement Adaptive Bitrate Control:enhancement,audio-quality:issue-09-adaptive-bitrate.md"
  "10:Create User Installation Guides:documentation,good-first-issue:issue-10-user-guides.md"
)

created_count=0
failed_count=0

for issue_data in "${issues[@]}"; do
  IFS=':' read -r num title labels filename <<< "$issue_data"
  
  if [ ! -f "$filename" ]; then
    echo "⚠️  Warning: File $filename not found, skipping..."
    ((failed_count++))
    continue
  fi
  
  echo "Creating Issue #$num: $title"
  
  # Strip the title and labels section from the body
  body=$(sed '/^## Labels$/,$d' "$filename")
  
  if gh issue create --title "$title" --body "$body" --label "$labels" 2>/dev/null; then
    echo "✅ Successfully created issue: $title"
    ((created_count++))
  else
    echo "❌ Failed to create issue: $title"
    ((failed_count++))
  fi
  
  echo ""
  
  # Be nice to GitHub API
  sleep 2
done

echo "===================================="
echo "Summary"
echo "===================================="
echo "✅ Successfully created: $created_count issues"
echo "❌ Failed: $failed_count issues"
echo ""

if [ $created_count -gt 0 ]; then
  echo "View your issues at: https://github.com/Zokiio/hytale-voicechat/issues"
fi
