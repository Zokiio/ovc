# GitHub Issues - Creation Guide

This directory contains 10 improvement issues ready to be created on GitHub. Each file corresponds to one issue that should be created.

## Issues Overview

| # | Title | Priority | Effort | Labels |
|---|-------|----------|--------|--------|
| 1 | Add UDP Encryption (DTLS or Custom) | High | Medium-High | `security`, `enhancement`, `high-priority` |
| 2 | Implement NAT Traversal (STUN/UPnP) | High | High | `networking`, `enhancement`, `high-priority` |
| 3 | Implement Token-Based Authentication | Medium | Medium | `security`, `enhancement` |
| 4 | Add Packet Loss Concealment (PLC) | Medium | Medium | `enhancement`, `audio-quality` |
| 5 | Create Browser-Based WebRTC Fallback Client | Low-Medium | High | `enhancement`, `feature` |
| 6 | Add Comprehensive Test Coverage | Medium | Medium | `testing`, `enhancement` |
| 7 | Implement Rate Limiting and DoS Protection | Medium | Low-Medium | `security`, `enhancement` |
| 8 | Add Admin/Moderation Features | Low | Low-Medium | `enhancement`, `feature` |
| 9 | Implement Adaptive Bitrate Control | Low | Medium | `enhancement`, `audio-quality` |
| 10 | Create User Installation Guides | Low | Low | `documentation`, `good-first-issue` |

## How to Create These Issues on GitHub

### Method 1: Manual Creation (Recommended)

1. **Navigate to your repository** on GitHub: https://github.com/Zokiio/hytale-voicechat
2. Click on the **"Issues"** tab
3. Click **"New Issue"** button
4. For each issue file:
   - Copy the entire content from the markdown file (without the filename)
   - Paste into the issue description
   - Extract the title from the first `#` heading and use it as the issue title
   - Add the labels mentioned at the bottom of each issue
   - Click **"Submit new issue"**
5. Repeat for all 10 issues

### Method 2: Using GitHub CLI (gh)

If you have the GitHub CLI installed and authenticated:

```bash
cd hytale-plugin/docs/github-issues

# Issue 1
gh issue create --title "Add UDP Encryption (DTLS or Custom)" --body-file issue-01-udp-encryption.md --label "security,enhancement,high-priority"

# Issue 2
gh issue create --title "Implement NAT Traversal (STUN/UPnP)" --body-file issue-02-nat-traversal.md --label "networking,enhancement,high-priority"

# Issue 3
gh issue create --title "Implement Token-Based Authentication" --body-file issue-03-token-authentication.md --label "security,enhancement"

# Issue 4
gh issue create --title "Add Packet Loss Concealment (PLC)" --body-file issue-04-packet-loss-concealment.md --label "enhancement,audio-quality"

# Issue 5
gh issue create --title "Create Browser-Based WebRTC Fallback Client" --body-file issue-05-webrtc-fallback.md --label "enhancement,feature"

# Issue 6
gh issue create --title "Add Comprehensive Test Coverage" --body-file issue-06-test-coverage.md --label "testing,enhancement"

# Issue 7
gh issue create --title "Implement Rate Limiting and DoS Protection" --body-file issue-07-rate-limiting.md --label "security,enhancement"

# Issue 8
gh issue create --title "Add Admin/Moderation Features" --body-file issue-08-admin-moderation.md --label "enhancement,feature"

# Issue 9
gh issue create --title "Implement Adaptive Bitrate Control" --body-file issue-09-adaptive-bitrate.md --label "enhancement,audio-quality"

# Issue 10
gh issue create --title "Create User Installation Guides" --body-file issue-10-user-guides.md --label "documentation,good-first-issue"
```

### Method 3: Bulk Creation Script

Create a script to automate the process:

```bash
#!/bin/bash
# create-all-issues.sh

# Array of issues with titles
declare -a issues=(
  "1:Add UDP Encryption (DTLS or Custom):security,enhancement,high-priority"
  "2:Implement NAT Traversal (STUN/UPnP):networking,enhancement,high-priority"
  "3:Implement Token-Based Authentication:security,enhancement"
  "4:Add Packet Loss Concealment (PLC):enhancement,audio-quality"
  "5:Create Browser-Based WebRTC Fallback Client:enhancement,feature"
  "6:Add Comprehensive Test Coverage:testing,enhancement"
  "7:Implement Rate Limiting and DoS Protection:security,enhancement"
  "8:Add Admin/Moderation Features:enhancement,feature"
  "9:Implement Adaptive Bitrate Control:enhancement,audio-quality"
  "10:Create User Installation Guides:documentation,good-first-issue"
)

cd "$(dirname "$0")"

for issue in "${issues[@]}"; do
  IFS=':' read -r num title labels <<< "$issue"
  printf -v filename "issue-%02d-*.md" "$num"
  file=$(ls $filename 2>/dev/null | head -1)
  
  if [ -f "$file" ]; then
    echo "Creating issue $num: $title"
    gh issue create --title "$title" --body-file "$file" --label "$labels"
    sleep 2  # Be nice to GitHub API
  else
    echo "Warning: File $file not found"
  fi
done

echo "All issues created successfully!"
```

Make it executable and run:
```bash
chmod +x create-all-issues.sh
./create-all-issues.sh
```

## Recommended Labels to Create First

Before creating the issues, ensure these labels exist in your repository:

- `security` - Security-related improvements
- `networking` - Network/connectivity features
- `enhancement` - General enhancements
- `audio-quality` - Audio quality improvements
- `feature` - New features
- `testing` - Testing infrastructure
- `documentation` - Documentation improvements
- `high-priority` - High priority items
- `good-first-issue` - Good for first-time contributors

## Recommended Implementation Order

**Phase 1 (MVP Security & Stability):**
1. Issue #3: Token-Based Authentication
2. Issue #7: Rate Limiting and DoS Protection
3. Issue #6: Add Test Coverage
4. Issue #10: User Guides

**Phase 2 (Network Reliability):**
5. Issue #4: Packet Loss Concealment
6. Issue #2: NAT Traversal
7. Issue #9: Adaptive Bitrate

**Phase 3 (Advanced Features):**
8. Issue #1: UDP Encryption
9. Issue #8: Admin/Moderation Features
10. Issue #5: Browser-Based Client (optional)

## Additional Notes

- Each issue includes checkboxes that can be used to track implementation progress
- Issues reference the competitive analysis document for context
- Consider creating a GitHub Project to organize these issues
- Link related issues together (e.g., Issue #4 and Issue #9 are related)
- Assign issues to team members or contributors as appropriate

## Need Help?

If you encounter any issues creating these on GitHub, you can:
1. Check GitHub's documentation: https://docs.github.com/en/issues
2. Verify you have the correct permissions to create issues
3. Ensure the repository is not archived or read-only
