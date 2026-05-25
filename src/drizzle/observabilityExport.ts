import type {
  VoiceObservabilityExportDeliveryReceipt,
  VoiceObservabilityExportDeliveryReceiptStore,
} from "../core/observabilityExport";
import {
  createVoiceDrizzleRecordStore,
  voiceDocumentTable,
  type VoiceDrizzleStoreOptions,
} from "./shared";

export const voiceObservabilityExportDeliveryReceiptsTable = voiceDocumentTable(
  "voice_observability_export_receipts",
);

export const createVoiceDrizzleObservabilityExportDeliveryReceiptStore = (
  options: VoiceDrizzleStoreOptions,
): VoiceObservabilityExportDeliveryReceiptStore =>
  createVoiceDrizzleRecordStore<VoiceObservabilityExportDeliveryReceipt>({
    db: options.db,
    decorate: (id, value) => ({
      ...value,
      id,
    }),
    getSortAt: (value) => value.checkedAt,
    table: voiceObservabilityExportDeliveryReceiptsTable,
  });
