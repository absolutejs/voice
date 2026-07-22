export type VoiceConfidenceCalibrationSample = {
  confidence: number;
  correct: boolean;
  metadata?: Record<string, unknown>;
};

export type VoiceConfidenceCalibrationBin = {
  accuracy: number;
  averageConfidence: number;
  count: number;
  lowerBound: number;
  upperBound: number;
};

export type VoiceConfidenceCalibrationReport = {
  bins: VoiceConfidenceCalibrationBin[];
  brierScore: number;
  expectedCalibrationError: number;
  sampleCount: number;
};

const clampConfidence = (value: number) => Math.max(0, Math.min(1, value));

export const calibrateVoiceConfidence = (
  samples: VoiceConfidenceCalibrationSample[],
  binCount = 10,
): VoiceConfidenceCalibrationReport => {
  const safeBinCount = Math.max(1, Math.round(binCount));
  const bins = Array.from({ length: safeBinCount }, (_, index) => {
    const lowerBound = index / safeBinCount;
    return {
      accuracy: 0,
      averageConfidence: 0,
      count: 0,
      lowerBound,
      upperBound: (index + 1) / safeBinCount,
    };
  });
  let brierTotal = 0;

  for (const sample of samples) {
    const confidence = clampConfidence(sample.confidence);
    const binIndex = Math.min(
      safeBinCount - 1,
      Math.floor(confidence * safeBinCount),
    );
    const bin = bins[binIndex]!;
    bin.count += 1;
    bin.averageConfidence += confidence;
    bin.accuracy += sample.correct ? 1 : 0;
    brierTotal += (confidence - (sample.correct ? 1 : 0)) ** 2;
  }

  let expectedCalibrationError = 0;
  for (const bin of bins) {
    if (bin.count === 0) continue;
    bin.averageConfidence /= bin.count;
    bin.accuracy /= bin.count;
    expectedCalibrationError +=
      (bin.count / Math.max(1, samples.length)) *
      Math.abs(bin.accuracy - bin.averageConfidence);
  }

  return {
    bins,
    brierScore: samples.length > 0 ? brierTotal / samples.length : 0,
    expectedCalibrationError,
    sampleCount: samples.length,
  };
};
