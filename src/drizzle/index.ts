import { voiceAssistantMemoryTable } from "./assistantMemory";
import { voiceEvalBaselineTable } from "./eval";
import { voiceHandoffDeliveriesTable } from "./handoff";
import { voiceIncidentBundlesTable } from "./incidentBundle";
import { voiceObservabilityExportDeliveryReceiptsTable } from "./observabilityExport";
import {
  voiceRealCallProfileEvidenceTable,
  voiceRealCallProfileRecoveryJobsTable,
} from "./proofTrends";
import { voiceRuntimeStorageDrizzleSchema } from "./runtimeStorage";

export * from "./shared";
export * from "./runtimeStorage";
export * from "./assistantMemory";
export * from "./eval";
export * from "./handoff";
export * from "./incidentBundle";
export * from "./observabilityExport";
export * from "./proofTrends";

// Every voice Drizzle table in one schema object; spread it into your own
// Drizzle schema so drizzle-kit (push/migrate) and Drizzle Studio manage the
// voice tables alongside your app tables.
export const voiceDrizzleSchema = {
  ...voiceRuntimeStorageDrizzleSchema,
  voiceAssistantMemory: voiceAssistantMemoryTable,
  voiceEvalBaseline: voiceEvalBaselineTable,
  voiceHandoffDeliveries: voiceHandoffDeliveriesTable,
  voiceIncidentBundles: voiceIncidentBundlesTable,
  voiceObservabilityExportReceipts:
    voiceObservabilityExportDeliveryReceiptsTable,
  voiceRealCallProfileEvidence: voiceRealCallProfileEvidenceTable,
  voiceRealCallProfileRecoveryJobs: voiceRealCallProfileRecoveryJobsTable,
};
