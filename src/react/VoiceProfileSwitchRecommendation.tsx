import { renderVoiceProfileSwitchRecommendationHTML } from "../client/profileSwitchRecommendationWidget";
import type { VoiceProfileSwitchRecommendationWidgetOptions } from "../client/profileSwitchRecommendationWidget";
import { useVoiceProfileSwitchRecommendation } from "./useVoiceProfileSwitchRecommendation";

export type VoiceProfileSwitchRecommendationProps =
  VoiceProfileSwitchRecommendationWidgetOptions & {
    className?: string;
    path?: string;
  };

export const VoiceProfileSwitchRecommendation = ({
  className,
  path = "/api/voice/profile-switch-recommendation",
  ...options
}: VoiceProfileSwitchRecommendationProps) => {
  const snapshot = useVoiceProfileSwitchRecommendation(path, options);
  const html = renderVoiceProfileSwitchRecommendationHTML(snapshot, options);

  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
  );
};
