# Create User Installation Guides

**Priority:** Low  
**Category:** Documentation  
**Effort:** Low

## Problem

Technical documentation exists, but no user-friendly installation guides for non-technical players. This increases support burden and limits adoption.

## Current State
- README.md is developer-focused
- No step-by-step player guides
- No troubleshooting documentation
- No screenshots/videos

## Proposed Solution

**Player Quick Start Guide:**
- Step-by-step installation (Windows/Mac/Linux)
- Screenshots of each step
- Video walkthrough (optional)
- Common issues and solutions

**Server Admin Guide:**
- Plugin installation steps
- Configuration explained simply
- Port forwarding instructions
- Common setup issues

**Troubleshooting Guide:**
- "Can't connect" scenarios
- Audio issues (no mic, no sound)
- Network/firewall problems
- Performance issues

## Implementation Tasks
- [ ] Write Windows installation guide
- [ ] Write macOS installation guide
- [ ] Write Linux installation guide
- [ ] Create server admin setup guide
- [ ] Write troubleshooting guide
- [ ] Take screenshots for each step
- [ ] (Optional) Record video tutorial
- [ ] Add FAQ section
- [ ] Create quick reference card
- [ ] Translate to common languages (optional)

## Acceptance Criteria
- Non-technical users can install without help
- Each OS has detailed guide
- Screenshots for every step
- Troubleshooting covers 90% of issues
- Links from in-game `/voice help`

## Document Structure
```
docs/
  user-guide/
    QUICK_START.md
    INSTALLATION_WINDOWS.md
    INSTALLATION_MAC.md
    INSTALLATION_LINUX.md
    SERVER_SETUP.md
    TROUBLESHOOTING.md
    FAQ.md
  images/
    install-step-*.png
  videos/
    quick-start.mp4 (optional)
```

## References
- Comparison doc: "Deployment Complexity"
- Consider creating website for docs (GitHub Pages)

## Labels
`documentation`, `good-first-issue`
