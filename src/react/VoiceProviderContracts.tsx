import { useVoiceProviderContracts } from "./useVoiceProviderContracts";
import {
  createVoiceProviderContractsViewModel,
  type VoiceProviderContractsWidgetOptions,
} from "../client/providerContractsWidget";

export type VoiceProviderContractsProps =
  VoiceProviderContractsWidgetOptions & {
    className?: string;
    path?: string;
  };

export const VoiceProviderContracts = ({
  className,
  path = "/api/provider-contracts",
  ...options
}: VoiceProviderContractsProps) => {
  const snapshot = useVoiceProviderContracts(path, options);
  const model = createVoiceProviderContractsViewModel(snapshot, options);

  return (
    <section
      className={[
        "absolute-voice-provider-contracts",
        `absolute-voice-provider-contracts--${model.status}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="absolute-voice-provider-contracts__header">
        <span className="absolute-voice-provider-contracts__eyebrow">
          {model.title}
        </span>
        <strong className="absolute-voice-provider-contracts__label">
          {model.label}
        </strong>
      </header>
      <p className="absolute-voice-provider-contracts__description">
        {model.description}
      </p>
      {model.rows.length ? (
        <div className="absolute-voice-provider-contracts__rows">
          {model.rows.map((row) => (
            <article
              className={[
                "absolute-voice-provider-contracts__row",
                `absolute-voice-provider-contracts__row--${row.status}`,
              ].join(" ")}
              key={`${row.kind}:${row.provider}`}
            >
              <header>
                <strong>{row.label}</strong>
                <span>{row.status}</span>
              </header>
              <p>{row.detail}</p>
              {row.remediations.length ? (
                <ul className="absolute-voice-provider-contracts__remediations">
                  {row.remediations.map((remediation) => (
                    <li
                      key={`${row.kind}:${row.provider}:${remediation.label}`}
                    >
                      {remediation.href ? (
                        <a href={remediation.href}>{remediation.label}</a>
                      ) : (
                        <strong>{remediation.label}</strong>
                      )}
                      <span>{remediation.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <dl>
                {row.rows.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <p className="absolute-voice-provider-contracts__empty">
          Configure provider contracts to see production coverage.
        </p>
      )}
      {model.error ? (
        <p className="absolute-voice-provider-contracts__error">
          {model.error}
        </p>
      ) : null}
    </section>
  );
};
