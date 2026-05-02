import {
  createVoiceProviderSimulationControlsStore,
  type VoiceProviderSimulationControlsOptions,
  type VoiceProviderSimulationControlsSnapshot,
  type VoiceProviderSimulationProvider,
} from "./providerSimulationControls";

export type VoiceProviderSimulationControlsViewModel<
  TProvider extends string = string,
> = {
  canSimulateFailure: boolean;
  description: string;
  error: string | null;
  failureProviders: VoiceProviderSimulationProvider<TProvider>[];
  isRunning: boolean;
  label: string;
  providers: VoiceProviderSimulationProvider<TProvider>[];
  resultText: string | null;
  title: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatKind = (kind: string | undefined) => (kind ?? "stt").toUpperCase();

export const createVoiceProviderSimulationControlsViewModel = <
  TProvider extends string = string,
>(
  snapshot: VoiceProviderSimulationControlsSnapshot<TProvider>,
  options: VoiceProviderSimulationControlsOptions<TProvider>,
): VoiceProviderSimulationControlsViewModel<TProvider> => {
  const configuredProviders = options.providers.filter(
    (provider) => provider.configured !== false,
  );
  const fallbackReady =
    !options.fallbackRequiredProvider ||
    configuredProviders.some(
      (entry) => entry.provider === options.fallbackRequiredProvider,
    );
  const failureProviders = (
    options.failureProviders
      ? options.failureProviders.map((provider) => ({ provider }))
      : configuredProviders
  ).filter((provider) =>
    configuredProviders.some((entry) => entry.provider === provider.provider),
  );

  return {
    canSimulateFailure: configuredProviders.length > 0 && fallbackReady,
    description:
      options.failureMessage ??
      `Simulate ${formatKind(options.kind)} provider failure and recovery without changing credentials.`,
    error: snapshot.error,
    failureProviders,
    isRunning: snapshot.isRunning,
    label: snapshot.isRunning
      ? `Running ${snapshot.mode ?? "simulation"}`
      : snapshot.lastResult
        ? `${snapshot.lastResult.provider} ${snapshot.lastResult.mode} simulated`
        : configuredProviders.length
          ? `${configuredProviders.length} configured`
          : "No configured providers",
    providers: configuredProviders,
    resultText: snapshot.lastResult
      ? JSON.stringify(snapshot.lastResult, null, 2)
      : null,
    title: options.title ?? `${formatKind(options.kind)} Failure Simulation`,
  };
};

export const renderVoiceProviderSimulationControlsHTML = <
  TProvider extends string = string,
>(
  snapshot: VoiceProviderSimulationControlsSnapshot<TProvider>,
  options: VoiceProviderSimulationControlsOptions<TProvider>,
) => {
  const model = createVoiceProviderSimulationControlsViewModel(
    snapshot,
    options,
  );
  const failureButtons = model.failureProviders
    .map(
      (provider) =>
        `<button type="button" data-voice-provider-fail="${escapeHtml(provider.provider)}"${!model.canSimulateFailure || snapshot.isRunning ? " disabled" : ""}>Simulate ${escapeHtml(provider.provider)} ${escapeHtml(formatKind(options.kind))} failure</button>`,
    )
    .join("");
  const recoveryButtons = model.providers
    .map(
      (provider) =>
        `<button type="button" data-voice-provider-recover="${escapeHtml(provider.provider)}"${snapshot.isRunning ? " disabled" : ""}>Mark ${escapeHtml(provider.provider)} recovered</button>`,
    )
    .join("");

  return `<section class="absolute-voice-provider-simulation absolute-voice-provider-simulation--${snapshot.error ? "error" : snapshot.isRunning ? "running" : "ready"}">
  <header class="absolute-voice-provider-simulation__header">
    <span class="absolute-voice-provider-simulation__eyebrow">${escapeHtml(model.title)}</span>
    <strong class="absolute-voice-provider-simulation__label">${escapeHtml(model.label)}</strong>
  </header>
  <p class="absolute-voice-provider-simulation__description">${escapeHtml(model.description)}</p>
  ${model.canSimulateFailure ? "" : `<p class="absolute-voice-provider-simulation__empty">${escapeHtml(options.fallbackRequiredMessage ?? "Configure fallback providers before simulating failure.")}</p>`}
  <div class="absolute-voice-provider-simulation__actions">${failureButtons}${recoveryButtons}</div>
  ${snapshot.error ? `<p class="absolute-voice-provider-simulation__error">${escapeHtml(snapshot.error)}</p>` : ""}
  ${model.resultText ? `<pre class="absolute-voice-provider-simulation__result">${escapeHtml(model.resultText)}</pre>` : ""}
</section>`;
};

export const bindVoiceProviderSimulationControls = <
  TProvider extends string = string,
>(
  element: Element,
  store: ReturnType<
    typeof createVoiceProviderSimulationControlsStore<TProvider>
  >,
) => {
  const onClick = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const failProvider = target.getAttribute("data-voice-provider-fail");
    const recoverProvider = target.getAttribute("data-voice-provider-recover");
    if (failProvider) {
      void store.run(failProvider as TProvider, "failure").catch(() => {});
    }
    if (recoverProvider) {
      void store.run(recoverProvider as TProvider, "recovery").catch(() => {});
    }
  };
  element.addEventListener("click", onClick);
  return () => element.removeEventListener("click", onClick);
};

export const mountVoiceProviderSimulationControls = <
  TProvider extends string = string,
>(
  element: Element,
  options: VoiceProviderSimulationControlsOptions<TProvider>,
) => {
  const store = createVoiceProviderSimulationControlsStore(options);
  const render = () => {
    element.innerHTML = renderVoiceProviderSimulationControlsHTML(
      store.getSnapshot(),
      options,
    );
  };
  const unsubscribeStore = store.subscribe(render);
  const unsubscribeDom = bindVoiceProviderSimulationControls(element, store);
  render();

  return {
    close: () => {
      unsubscribeDom();
      unsubscribeStore();
      store.close();
    },
    run: store.run,
  };
};

export const defineVoiceProviderSimulationControlsElement = (
  tagName = "absolute-voice-provider-simulation",
) => {
  if (
    typeof window === "undefined" ||
    typeof customElements === "undefined" ||
    customElements.get(tagName)
  ) {
    return;
  }

  customElements.define(
    tagName,
    class AbsoluteVoiceProviderSimulationElement extends HTMLElement {
      private mounted?: ReturnType<typeof mountVoiceProviderSimulationControls>;

      connectedCallback() {
        const providers = (this.getAttribute("providers") ?? "")
          .split(",")
          .map((provider) => provider.trim())
          .filter(Boolean)
          .map((provider) => ({ provider }));
        const failureProviders = (this.getAttribute("failure-providers") ?? "")
          .split(",")
          .map((provider) => provider.trim())
          .filter(Boolean);
        this.mounted = mountVoiceProviderSimulationControls(this, {
          failureProviders: failureProviders.length
            ? failureProviders
            : undefined,
          fallbackRequiredMessage:
            this.getAttribute("fallback-required-message") ?? undefined,
          fallbackRequiredProvider:
            this.getAttribute("fallback-required-provider") ?? undefined,
          failureMessage: this.getAttribute("failure-message") ?? undefined,
          kind: this.getAttribute("kind") ?? "stt",
          pathPrefix: this.getAttribute("path-prefix") ?? undefined,
          providers,
          title: this.getAttribute("title") ?? undefined,
        });
      }

      disconnectedCallback() {
        this.mounted?.close();
        this.mounted = undefined;
      }
    },
  );
};
