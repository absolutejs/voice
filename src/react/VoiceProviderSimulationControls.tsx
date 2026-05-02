import type { VoiceIOProviderFailureSimulationMode } from "../testing/ioProviderSimulator";
import { createVoiceProviderSimulationControlsViewModel } from "../client/providerSimulationControlsWidget";
import type { VoiceProviderSimulationControlsOptions } from "../client/providerSimulationControls";
import { useVoiceProviderSimulationControls } from "./useVoiceProviderSimulationControls";

export type VoiceProviderSimulationControlsProps<
  TProvider extends string = string,
> = VoiceProviderSimulationControlsOptions<TProvider> & {
  className?: string;
};

export const VoiceProviderSimulationControls = <
  TProvider extends string = string,
>({
  className,
  ...options
}: VoiceProviderSimulationControlsProps<TProvider>) => {
  const snapshot = useVoiceProviderSimulationControls(options);
  const model = createVoiceProviderSimulationControlsViewModel(
    snapshot,
    options,
  );
  const run = (
    provider: TProvider,
    mode: VoiceIOProviderFailureSimulationMode,
  ) => {
    void snapshot.run(provider, mode).catch(() => {});
  };

  return (
    <section
      className={[
        "absolute-voice-provider-simulation",
        `absolute-voice-provider-simulation--${snapshot.error ? "error" : snapshot.isRunning ? "running" : "ready"}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="absolute-voice-provider-simulation__header">
        <span className="absolute-voice-provider-simulation__eyebrow">
          {model.title}
        </span>
        <strong className="absolute-voice-provider-simulation__label">
          {model.label}
        </strong>
      </header>
      <p className="absolute-voice-provider-simulation__description">
        {model.description}
      </p>
      {model.canSimulateFailure ? null : (
        <p className="absolute-voice-provider-simulation__empty">
          {options.fallbackRequiredMessage ??
            "Configure fallback providers before simulating failure."}
        </p>
      )}
      <div className="absolute-voice-provider-simulation__actions">
        {model.failureProviders.map((provider) => (
          <button
            disabled={!model.canSimulateFailure || snapshot.isRunning}
            key={`fail-${provider.provider}`}
            onClick={() => run(provider.provider, "failure")}
            type="button"
          >
            Simulate {provider.provider} {(options.kind ?? "stt").toUpperCase()}{" "}
            failure
          </button>
        ))}
        {model.providers.map((provider) => (
          <button
            disabled={snapshot.isRunning}
            key={`recover-${provider.provider}`}
            onClick={() => run(provider.provider, "recovery")}
            type="button"
          >
            Mark {provider.provider} recovered
          </button>
        ))}
      </div>
      {snapshot.error ? (
        <p className="absolute-voice-provider-simulation__error">
          {snapshot.error}
        </p>
      ) : null}
      {model.resultText ? (
        <pre className="absolute-voice-provider-simulation__result">
          {model.resultText}
        </pre>
      ) : null}
    </section>
  );
};
