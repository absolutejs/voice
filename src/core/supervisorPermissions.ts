export type VoiceSupervisorCapability =
  | "monitor"
  | "annotate"
  | "coach"
  | "whisper"
  | "barge"
  | "takeover"
  | "release"
  | "end-call"
  | "view-pii"
  | "export-recording";

export type VoiceSupervisorTier =
  | "monitor-only"
  | "annotate"
  | "coach"
  | "whisper"
  | "full-control";

const TIER_CAPABILITIES: Record<
  VoiceSupervisorTier,
  VoiceSupervisorCapability[]
> = {
  annotate: ["monitor", "annotate"],
  coach: ["monitor", "annotate", "coach"],
  "full-control": [
    "monitor",
    "annotate",
    "coach",
    "whisper",
    "barge",
    "takeover",
    "release",
    "end-call",
    "view-pii",
    "export-recording",
  ],
  "monitor-only": ["monitor"],
  whisper: ["monitor", "annotate", "coach", "whisper"],
};

export type VoiceSupervisorPermission = {
  supervisorId: string;
  tier: VoiceSupervisorTier;
  extraCapabilities?: VoiceSupervisorCapability[];
  deniedCapabilities?: VoiceSupervisorCapability[];
  expiresAt?: number;
};

export type VoiceSupervisorPermissionCheck = {
  allowed: boolean;
  reason?: "no-permission" | "expired" | "denied" | "tier-too-low";
};

export type CreateVoiceSupervisorPermissionsOptions = {
  defaultTier?: VoiceSupervisorTier;
  permissions?: VoiceSupervisorPermission[];
  now?: () => number;
};

export const createVoiceSupervisorPermissions = (
  options: CreateVoiceSupervisorPermissionsOptions = {},
) => {
  const now = options.now ?? (() => Date.now());
  const store = new Map<string, VoiceSupervisorPermission>();
  for (const permission of options.permissions ?? []) {
    store.set(permission.supervisorId, permission);
  }
  const defaultTier: VoiceSupervisorTier | null = options.defaultTier ?? null;

  const get = (supervisorId: string): VoiceSupervisorPermission | null => {
    const permission = store.get(supervisorId);
    if (!permission) {
      return defaultTier ? { supervisorId, tier: defaultTier } : null;
    }
    if (permission.expiresAt !== undefined && permission.expiresAt <= now()) {
      return null;
    }

    return permission;
  };

  const capabilitiesFor = (
    supervisorId: string,
  ): VoiceSupervisorCapability[] => {
    const permission = get(supervisorId);
    if (!permission) return [];
    const base = new Set(TIER_CAPABILITIES[permission.tier]);
    for (const extra of permission.extraCapabilities ?? []) base.add(extra);
    for (const denied of permission.deniedCapabilities ?? [])
      base.delete(denied);

    return Array.from(base);
  };

  const can = (
    supervisorId: string,
    capability: VoiceSupervisorCapability,
  ): VoiceSupervisorPermissionCheck => {
    const permission = store.get(supervisorId);
    if (!permission) {
      if (!defaultTier) return { allowed: false, reason: "no-permission" };
    } else if (
      permission.expiresAt !== undefined &&
      permission.expiresAt <= now()
    ) {
      return { allowed: false, reason: "expired" };
    } else if (permission.deniedCapabilities?.includes(capability)) {
      return { allowed: false, reason: "denied" };
    }
    if (capabilitiesFor(supervisorId).includes(capability)) {
      return { allowed: true };
    }

    return { allowed: false, reason: "tier-too-low" };
  };

  const grant = (
    supervisorId: string,
    tier: VoiceSupervisorTier,
    options: {
      extraCapabilities?: VoiceSupervisorCapability[];
      deniedCapabilities?: VoiceSupervisorCapability[];
      expiresAt?: number;
    } = {},
  ): VoiceSupervisorPermission => {
    const permission: VoiceSupervisorPermission = {
      supervisorId,
      tier,
      ...(options.extraCapabilities !== undefined
        ? { extraCapabilities: options.extraCapabilities }
        : {}),
      ...(options.deniedCapabilities !== undefined
        ? { deniedCapabilities: options.deniedCapabilities }
        : {}),
      ...(options.expiresAt !== undefined
        ? { expiresAt: options.expiresAt }
        : {}),
    };
    store.set(supervisorId, permission);

    return permission;
  };

  const revoke = (supervisorId: string): boolean => store.delete(supervisorId);

  const enforce = (
    supervisorId: string,
    capability: VoiceSupervisorCapability,
  ): void => {
    const verdict = can(supervisorId, capability);
    if (!verdict.allowed) {
      throw new Error(
        `Supervisor ${supervisorId} cannot ${capability}: ${verdict.reason ?? "denied"}`,
      );
    }
  };

  return {
    can,
    capabilitiesFor,
    enforce,
    get,
    grant,
    revoke,
    tiers: () => Object.keys(TIER_CAPABILITIES) as VoiceSupervisorTier[],
  };
};

export type VoiceSupervisorPermissions = ReturnType<
  typeof createVoiceSupervisorPermissions
>;

export const VOICE_SUPERVISOR_TIER_CAPABILITIES = TIER_CAPABILITIES;
