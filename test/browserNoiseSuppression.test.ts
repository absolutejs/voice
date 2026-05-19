import { describe, expect, test } from "bun:test";
import {
  BROWSER_NOISE_SUPPRESSOR_PRESETS,
  applyBrowserNoiseSuppression,
} from "../src/client/browserNoiseSuppression";

describe("BROWSER_NOISE_SUPPRESSOR_PRESETS", () => {
  test("rnnoise preset points at the documented processor name", () => {
    const preset = BROWSER_NOISE_SUPPRESSOR_PRESETS.rnnoise(
      "https://cdn.example.com/rnnoise-processor.js",
    );
    expect(preset.processorName).toBe("rnnoise-processor");
    expect(preset.workletUrl).toBe(
      "https://cdn.example.com/rnnoise-processor.js",
    );
    expect(preset.label).toBe("RNNoise");
  });

  test("deepfilternet preset wires the right processor name", () => {
    const preset = BROWSER_NOISE_SUPPRESSOR_PRESETS.deepfilternet("/df.js");
    expect(preset.processorName).toBe("deepfilter-suppressor");
    expect(preset.label).toBe("DeepFilterNet");
  });
});

describe("applyBrowserNoiseSuppression", () => {
  test("throws a clear error in non-browser environments", async () => {
    // bun test runs in a non-browser environment; AudioContext is undefined.
    await expect(
      applyBrowserNoiseSuppression({
        processorName: "rnnoise-processor",
        stream: {} as MediaStream,
        workletUrl: "/rnnoise.js",
      }),
    ).rejects.toThrow(/requires a browser environment/);
  });
});
