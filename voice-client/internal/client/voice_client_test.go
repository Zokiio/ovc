package client

import (
	"testing"
)

// TestSeqNumLessThan tests sequence number comparison with wraparound handling
func TestSeqNumLessThan(t *testing.T) {
	tests := []struct {
		name     string
		a        uint32
		b        uint32
		expected bool
	}{
		// Normal cases (no wraparound)
		{
			name:     "a < b (normal)",
			a:        100,
			b:        200,
			expected: true,
		},
		{
			name:     "a > b (normal)",
			a:        200,
			b:        100,
			expected: false,
		},
		{
			name:     "a == b",
			a:        100,
			b:        100,
			expected: false,
		},
		{
			name:     "a = 0, b = 1",
			a:        0,
			b:        1,
			expected: true,
		},

		// Wraparound cases
		{
			name:     "wraparound: a near max, b near zero (a < b)",
			a:        0xFFFFFFFE, // 4294967294
			b:        0x00000001, // 1
			expected: true,
		},
		{
			name:     "wraparound: a at max, b at zero (a < b)",
			a:        0xFFFFFFFF, // 4294967295
			b:        0x00000000, // 0
			expected: true,
		},
		{
			name:     "wraparound: a at max, b = 1 (a < b)",
			a:        0xFFFFFFFF, // 4294967295
			b:        0x00000001, // 1
			expected: true,
		},
		{
			name:     "wraparound: b near max, a near zero (b < a)",
			a:        0x00000001, // 1
			b:        0xFFFFFFFE, // 4294967294
			expected: false,
		},

		// Edge case: exactly at 2^31 boundary
		{
			name:     "max distance forward (a < b)",
			a:        0,
			b:        0x80000000, // 2^31 = 2147483648
			expected: true,
		},
		{
			name:     "max distance backward (b < a)",
			a:        0x80000000, // 2^31
			b:        0,
			expected: false,
		},
		{
			name:     "boundary: a=1, b at half range",
			a:        1,
			b:        0x80000001, // 2^31 + 1
			expected: true,
		},
		{
			name:     "boundary: a at half range, b=1",
			a:        0x80000001, // 2^31 + 1
			b:        1,
			expected: false,
		},

		// Additional wraparound scenarios
		{
			name:     "small wraparound gap",
			a:        0xFFFFFFFC, // -4 in int32
			b:        0x00000002, // 2
			expected: true,
		},
		{
			name:     "large sequence difference without wraparound",
			a:        1000,
			b:        1000000,
			expected: true,
		},
		{
			name:     "near boundary case 1",
			a:        0x7FFFFFFF, // Just below 2^31
			b:        0x80000000, // Exactly 2^31
			expected: true,
		},
		{
			name:     "near boundary case 2",
			a:        0x80000000, // Exactly 2^31
			b:        0x7FFFFFFF, // Just below 2^31
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := seqNumLessThan(tt.a, tt.b)
			if result != tt.expected {
				t.Errorf("seqNumLessThan(%d, %d) = %v, expected %v", tt.a, tt.b, result, tt.expected)
			}
		})
	}
}

// TestSeqNumLessThanTransitivity tests that the comparison maintains transitivity where possible
func TestSeqNumLessThanTransitivity(t *testing.T) {
	// For sequences that are close together (within reasonable window), transitivity should hold
	sequences := []uint32{100, 101, 102, 103, 104, 105}

	for i := 0; i < len(sequences)-1; i++ {
		if !seqNumLessThan(sequences[i], sequences[i+1]) {
			t.Errorf("Expected %d < %d", sequences[i], sequences[i+1])
		}
	}

	// Test wraparound transitivity
	wrapSequences := []uint32{0xFFFFFFFD, 0xFFFFFFFE, 0xFFFFFFFF, 0, 1, 2}

	for i := 0; i < len(wrapSequences)-1; i++ {
		if !seqNumLessThan(wrapSequences[i], wrapSequences[i+1]) {
			t.Errorf("Expected %d < %d (wraparound)", wrapSequences[i], wrapSequences[i+1])
		}
	}
}
