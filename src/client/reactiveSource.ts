// A transport-agnostic push trigger for the widget client stores. Instead of (or
// alongside) interval polling, a consumer can supply a reactiveSource that calls
// the provided refresh callback whenever upstream data changes — e.g. backed by
// @absolutejs/sync's SSE subscriber, a WebSocket, or any event stream. The store
// stays unaware of the transport; it just refreshes when told to. A reactiveSource
// may return an unsubscribe handle, which the store invokes on close.
export type VoiceReactiveSource = (refresh: () => void) => (() => void) | void;

export const bindVoiceReactiveSource = (
  refresh: () => void,
  source?: VoiceReactiveSource,
): (() => void) => {
  const cleanup = source?.(refresh);

  return typeof cleanup === "function" ? cleanup : () => {};
};

export type VoiceSseReactiveSourceOptions = {
  // SSE endpoint path; the server filters by the `topics` query param. Defaults
  // to "/sync" (the @absolutejs/sync plugin default).
  path?: string;
  withCredentials?: boolean;
  // Override for non-browser/test environments.
  eventSourceImpl?: typeof EventSource;
};

// A reactiveSource backed by a plain Server-Sent Events connection — the one
// transport a custom element can wire up from string attributes alone (a
// function can't ride on an HTML attribute). Used by the `reactive-topic`
// attribute on the voice widget custom elements; kept dependency-free (no
// @absolutejs/sync) so the package stays transport-agnostic at its core.
export const voiceSseReactiveSource =
  (
    topic: string,
    options: VoiceSseReactiveSourceOptions = {},
  ): VoiceReactiveSource =>
  (refresh) => {
    const Impl =
      options.eventSourceImpl ??
      (typeof EventSource !== "undefined" ? EventSource : undefined);
    if (!Impl) {
      return () => {};
    }
    const url = `${options.path ?? "/sync"}?topics=${encodeURIComponent(topic)}`;
    const source = new Impl(url, {
      withCredentials: options.withCredentials ?? false,
    });
    source.onmessage = () => refresh();

    return () => source.close();
  };
