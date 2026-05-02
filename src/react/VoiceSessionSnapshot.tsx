import {
  createVoiceSessionSnapshotViewModel,
  type VoiceSessionSnapshotWidgetOptions,
} from "../client/sessionSnapshotWidget";
import { useVoiceSessionSnapshot } from "./useVoiceSessionSnapshot";

export type VoiceSessionSnapshotProps = VoiceSessionSnapshotWidgetOptions & {
  className?: string;
  path: string;
};

export const VoiceSessionSnapshot = ({
  className,
  path,
  ...options
}: VoiceSessionSnapshotProps) => {
  const state = useVoiceSessionSnapshot(path, options);
  const model = createVoiceSessionSnapshotViewModel(state, options);

  return (
    <section
      className={[
        "absolute-voice-session-snapshot",
        `absolute-voice-session-snapshot--${model.status}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="absolute-voice-session-snapshot__header">
        <span className="absolute-voice-session-snapshot__eyebrow">
          {model.title}
        </span>
        <strong className="absolute-voice-session-snapshot__label">
          {model.label}
        </strong>
      </header>
      <p className="absolute-voice-session-snapshot__description">
        {model.description}
      </p>
      {model.showDownload ? (
        <button
          className="absolute-voice-session-snapshot__download"
          onClick={() => state.download()}
          type="button"
        >
          {options.downloadLabel ?? "Download snapshot"}
        </button>
      ) : null}
      {model.rows.length ? (
        <dl>
          {model.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="absolute-voice-session-snapshot__empty">
          Load a session snapshot to see support diagnostics.
        </p>
      )}
      {model.error ? (
        <p className="absolute-voice-session-snapshot__error">{model.error}</p>
      ) : null}
    </section>
  );
};
