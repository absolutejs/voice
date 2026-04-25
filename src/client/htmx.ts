import type { VoiceHTMXBindingOptions, VoiceStream } from '../types';

type HtmxWindow = Window & {
	htmx?: {
		process?: (element: Element) => void;
		trigger?: (target: Element | string, eventName: string) => void;
	};
};

const DEFAULT_EVENT_NAME = 'voice-refresh';
const DEFAULT_QUERY_PARAM = 'sessionId';

const resolveElement = (input: Element | string) => {
	if (typeof input !== 'string') {
		return input;
	}

	return document.querySelector(input);
};

const buildRoute = (
	element: Element,
	route: string | undefined,
	queryParam: string,
	sessionId: string | null
) => {
	const baseRoute = route ?? element.getAttribute('hx-get') ?? '';
	if (!baseRoute) {
		return '';
	}

	const url = new URL(baseRoute, window.location.origin);

	if (sessionId) {
		url.searchParams.set(queryParam, sessionId);
	} else {
		url.searchParams.delete(queryParam);
	}

	return `${url.pathname}${url.search}${url.hash}`;
};

export const bindVoiceHTMX = <TResult = unknown>(
	stream: VoiceStream<TResult>,
	options: VoiceHTMXBindingOptions
) => {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return () => {};
	}

	const element = resolveElement(options.element);
	if (!element) {
		return () => {};
	}

	const eventName = options.eventName ?? DEFAULT_EVENT_NAME;
	const queryParam = options.sessionQueryParam ?? DEFAULT_QUERY_PARAM;

	const sync = () => {
		const htmxWindow = window as unknown as HtmxWindow;
		const nextRoute = buildRoute(
			element,
			options.route,
			queryParam,
			stream.sessionId
		);

		if (nextRoute) {
			element.setAttribute('hx-get', nextRoute);
		}

		htmxWindow.htmx?.process?.(element);
		htmxWindow.htmx?.trigger?.(element, eventName);
	};

	const unsubscribe = stream.subscribe(sync);
	sync();

	return () => {
		unsubscribe();
	};
};
