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

// frameSizeForSampleRate returns the number of PCM samples in a single audio
// frame for the given sampleRate, assuming a fixed frame duration of
// frameDurationMs (20ms). For example, at 48000 Hz this yields 960 samples
// (48000 * 20 / 1000), matching the Opus 20ms frame size.
func frameSizeForSampleRate(sampleRate int) int {
	return sampleRate * frameDurationMs / 1000
}
