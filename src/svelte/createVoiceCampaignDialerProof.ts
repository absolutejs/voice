import { createVoiceCampaignDialerProofStore } from "../client/campaignDialerProof";
import type { VoiceCampaignDialerProofClientOptions } from "../client/campaignDialerProof";

export const createVoiceCampaignDialerProof = (
  path = "/api/voice/campaigns/dialer-proof",
  options: VoiceCampaignDialerProofClientOptions = {},
) => createVoiceCampaignDialerProofStore(path, options);
