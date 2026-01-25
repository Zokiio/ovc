package client

const (
	defaultSampleRate = 48000
	frameDurationMs  = 20
)

var supportedSampleRates = []int{8000, 12000, 16000, 24000, 48000}

func isSupportedSampleRate(sampleRate int) bool {
	for _, rate := range supportedSampleRates {
		if sampleRate == rate {
			return true
		}
	}
	return false
}

func sanitizeSampleRate(sampleRate int) int {
	if isSupportedSampleRate(sampleRate) {
		return sampleRate
	}
	return defaultSampleRate
}

func frameSizeForSampleRate(sampleRate int) int {
	return sampleRate * frameDurationMs / 1000
}
