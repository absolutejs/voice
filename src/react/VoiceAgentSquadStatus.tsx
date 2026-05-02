import { useVoiceAgentSquadStatus } from "./useVoiceAgentSquadStatus";
import {
  createVoiceAgentSquadStatusViewModel,
  type VoiceAgentSquadStatusWidgetOptions,
} from "../client/agentSquadStatusWidget";

export type VoiceAgentSquadStatusProps = VoiceAgentSquadStatusWidgetOptions & {
  path?: string;
};

export function VoiceAgentSquadStatus({
  path = "/api/voice-traces",
  ...options
}: VoiceAgentSquadStatusProps) {
  const snapshot = useVoiceAgentSquadStatus(path, options);
  const model = createVoiceAgentSquadStatusViewModel(snapshot, options);
  const current = model.current;

  return (
    <section className="absolute-voice-agent-squad-status">
      <header>
        <span>{model.title}</span>
        <strong>{model.label}</strong>
      </header>
      <p>{model.description}</p>
      <dl>
        <div>
          <dt>Session</dt>
          <dd>{current?.sessionId ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Current specialist</dt>
          <dd>{current?.targetAgentId ?? "none"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{current?.status ?? "idle"}</dd>
        </div>
      </dl>
      {model.error ? <p>{model.error}</p> : null}
    </section>
  );
}
