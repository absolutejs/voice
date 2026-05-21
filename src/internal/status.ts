/**
 * The shared three-level health status used across voice reports. Severity
 * order is fail > warn > pass.
 */
export type VoiceStatus = "fail" | "pass" | "warn";

/** Severity rank for a status (fail=2, warn=1, pass=0). Higher is worse. */
const voiceStatusRank = (status: VoiceStatus): number =>
  status === "fail" ? 2 : status === "warn" ? 1 : 0;

/** Reduce a set of statuses to the worst one (fail > warn > pass). */
export const worstVoiceStatus = (
  statuses: Iterable<VoiceStatus>,
): VoiceStatus => {
  let worst: VoiceStatus = "pass";
  for (const status of statuses) {
    if (voiceStatusRank(status) > voiceStatusRank(worst)) {
      worst = status;
    }
  }
  return worst;
};
