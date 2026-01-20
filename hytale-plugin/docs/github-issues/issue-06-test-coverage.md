# Add Comprehensive Test Coverage

**Priority:** Medium  
**Category:** Testing  
**Effort:** Medium

## Problem

Limited test coverage makes refactoring risky and bugs more likely. giulienw's solution has unit tests (v1.0.0 quality). We need tests for protocol, audio processing, and network logic.

## Current State
- Minimal or no automated tests
- Manual testing only
- No CI/CD pipeline
- Regression risk with changes

## Proposed Solution

**Go Client Tests:**
- Unit tests for audio processing
- Protocol encoding/decoding tests
- Mock audio device tests
- Configuration handling tests

**Java Plugin Tests:**
- Unit tests for packet handling
- Proximity calculation tests
- Opus codec tests
- Player tracking tests

**Integration Tests:**
- End-to-end client-server tests
- Multi-client scenarios
- Network failure scenarios
- Protocol compatibility tests

## Implementation Tasks

**Client (Go):**
- [ ] Set up Go testing framework
- [ ] Write tests for audio_manager.go
- [ ] Write tests for voice_client.go (network)
- [ ] Write protocol encode/decode tests
- [ ] Mock PortAudio for testing
- [ ] Add benchmark tests for audio pipeline

**Plugin (Java):**
- [ ] Set up JUnit 5
- [ ] Write tests for OpusCodec
- [ ] Write tests for PlayerPositionTracker
- [ ] Write tests for packet serialization
- [ ] Write tests for proximity calculations
- [ ] Mock Netty for network tests

**Integration:**
- [ ] Set up Docker test environment
- [ ] Write client-server integration tests
- [ ] Test multiple concurrent clients
- [ ] Test packet loss scenarios
- [ ] Test authentication flow

**CI/CD:**
- [ ] Set up GitHub Actions workflow
- [ ] Run tests on push/PR
- [ ] Add code coverage reporting
- [ ] Cross-platform build tests

## Acceptance Criteria
- >70% code coverage on critical paths
- All tests pass in CI
- Integration tests for main flows
- Documented testing approach
- Coverage reports generated

## References
- Go testing: https://go.dev/doc/tutorial/add-a-test
- JUnit 5: https://junit.org/junit5/docs/current/user-guide/
- Comparison doc: "Maturity & Completeness"

## Labels
`testing`, `enhancement`
