import type { VoiceHandoffDeliveryRecord } from "../core/handoff";
import type { VoiceHandoffDeliveryStore } from "../core/types";
import {
  createVoiceDrizzleRecordStore,
  voiceDocumentTable,
  type VoiceDrizzleDatabase,
  type VoiceDrizzleStoreOptions,
} from "./shared";

export const voiceHandoffDeliveriesTable = voiceDocumentTable(
  "voice_handoff_deliveries",
);

const createDrizzleHandoffDeliveryStore = <
  TDelivery extends VoiceHandoffDeliveryRecord = VoiceHandoffDeliveryRecord,
>(
  db: VoiceDrizzleDatabase,
): VoiceHandoffDeliveryStore<TDelivery> =>
  createVoiceDrizzleRecordStore<TDelivery>({
    db,
    decorate: (_id, value) => value,
    getSortAt: (value) => value.createdAt,
    table: voiceHandoffDeliveriesTable,
  });

export const createVoiceDrizzleHandoffDeliveryStore = <
  TDelivery extends VoiceHandoffDeliveryRecord = VoiceHandoffDeliveryRecord,
>(
  options: VoiceDrizzleStoreOptions,
): VoiceHandoffDeliveryStore<TDelivery> =>
  createDrizzleHandoffDeliveryStore(options.db);
