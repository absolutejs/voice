import { expect, test } from "bun:test";
import { computeVoiceReconnectDelayMs } from "../src/client/connection";

const BASE = 500;
const CAP = 8_000;

test("reconnect backoff doubles from the base then holds at the cap", () => {
  const delays = [1, 2, 3, 4, 5, 6, 7].map((attempt) =>
    computeVoiceReconnectDelayMs(attempt, BASE, CAP),
  );

  expect(delays).toEqual([500, 1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
});

test("default 15-attempt window outlasts a server redeploy (~95s)", () => {
  let total = 0;
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    total += computeVoiceReconnectDelayMs(attempt, BASE, CAP);
  }

  // 0.5+1+2+4+8 = 15.5s for the ramp, then 10×8s = 80s at the cap.
  expect(total).toBe(95_500);
  expect(total).toBeGreaterThan(90_000);
});

test("a guard keeps a zero/negative attempt at the base delay", () => {
  expect(computeVoiceReconnectDelayMs(0, BASE, CAP)).toBe(BASE);
  expect(computeVoiceReconnectDelayMs(-3, BASE, CAP)).toBe(BASE);
});
