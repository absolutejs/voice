export type VoiceProofTargetMethod = 'GET' | 'POST';

export type VoiceProofTarget = {
	accept?: string;
	allowLogicalFail?: boolean;
	body?: unknown;
	kind: 'json' | 'text';
	method?: VoiceProofTargetMethod;
	name: string;
	path: string;
	requiredText?: string[];
};

export type VoiceProofTargetResult = {
	body?: unknown;
	bytes: number;
	elapsedMs: number;
	error?: string;
	kind: VoiceProofTarget['kind'];
	method: VoiceProofTargetMethod;
	name: string;
	ok: boolean;
	path: string;
	status?: number;
	summary?: Record<string, unknown>;
	url: string;
};

export type VoiceProofTargetRunnerOptions = {
	baseUrl: string;
	fetch?: typeof fetch;
	now?: () => number;
	timeoutMs?: number;
	writeArtifact?: (input: {
		content: string;
		name: string;
		target: VoiceProofTarget;
	}) => Promise<void> | void;
};

export type VoiceProofTargetRunOptions = VoiceProofTargetRunnerOptions & {
	concurrency?: number;
};

const encoder = new TextEncoder();

const trimBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, '');

const safeArtifactName = (name: string) => name.replace(/[^a-z0-9_.-]/gi, '-');

const summarizeValue = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return { count: value.length };
	}
	if (!value || typeof value !== 'object') {
		return value;
	}

	const record = value as Record<string, unknown>;
	const preferredKeys = [
		'status',
		'ok',
		'pass',
		'ready',
		'proof',
		'total',
		'passed',
		'failed',
		'issues',
		'summary',
		'links',
		'actions',
		'checks',
		'campaigns',
		'recipients',
		'attempts',
		'telephonyMedia',
		'operationsRecordHref',
		'sentEvents',
		'tasks',
		'reviews',
		'events',
		'eventsWithLatency',
		'observabilityExportReplay',
		'validationIssues',
		'deliveryDestinations',
		'failedDeliveryDestinations',
		'failedArtifacts',
		'artifacts',
		'kinds',
		'redaction',
		'retentionPlan',
		'zeroRetentionAvailable'
	];
	const summary: Record<string, unknown> = {};

	for (const key of preferredKeys) {
		if (key in record) {
			summary[key] = summarizeValue(record[key]);
		}
	}

	return Object.keys(summary).length > 0
		? summary
		: {
				keys: Object.keys(record).slice(0, 12)
			};
};

export const getVoiceProofTargetLogicalFailure = (value: unknown) => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}

	const record = value as Record<string, unknown>;
	if (record.status === 'fail') {
		return 'Response status is "fail".';
	}
	if (record.pass === false) {
		return 'Response pass is false.';
	}
	if (record.ok === false) {
		return 'Response ok is false.';
	}

	return undefined;
};

export const mapVoiceProofTargetsWithConcurrency = async <TInput, TOutput>(
	items: TInput[],
	limit: number,
	mapper: (item: TInput) => Promise<TOutput>
) => {
	const results = new Array<TOutput>(items.length);
	let nextIndex = 0;
	const workerCount = Math.min(Math.max(1, limit), items.length);

	const workers = Array.from({ length: workerCount }, async () => {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			const item = items[index];
			if (item !== undefined) {
				results[index] = await mapper(item);
			}
		}
	});

	await Promise.all(workers);
	return results;
};

export const fetchVoiceProofTarget = async (
	target: VoiceProofTarget,
	options: VoiceProofTargetRunnerOptions
): Promise<VoiceProofTargetResult> => {
	const method = target.method ?? 'GET';
	const baseUrl = trimBaseUrl(options.baseUrl);
	const url = `${baseUrl}${target.path}`;
	const fetcher = options.fetch ?? globalThis.fetch;
	const now = options.now ?? performance.now.bind(performance);
	const startedAt = now();
	const controller = new AbortController();
	const timeout =
		options.timeoutMs && options.timeoutMs > 0
			? setTimeout(() => controller.abort(), options.timeoutMs)
			: undefined;

	try {
		const response = await fetcher(url, {
			body: target.body === undefined ? undefined : JSON.stringify(target.body),
			headers: {
				accept:
					target.accept ??
					(target.kind === 'json'
						? 'application/json'
						: 'text/markdown,text/plain,*/*'),
				...(target.body === undefined
					? {}
					: { 'content-type': 'application/json' })
			},
			method,
			signal: controller.signal
		});
		const text = await response.text();
		const bytes = encoder.encode(text).byteLength;
		let body: unknown = text;
		let parseError: string | undefined;

		if (target.kind === 'json' && text.trim()) {
			try {
				body = JSON.parse(text) as unknown;
			} catch (error) {
				parseError = error instanceof Error ? error.message : String(error);
			}
		}

		const missingText =
			target.kind === 'text'
				? (target.requiredText ?? []).filter((item) => !text.includes(item))
				: [];
		const logicalFailure =
			target.kind === 'json' && !parseError && !target.allowLogicalFail
				? getVoiceProofTargetLogicalFailure(body)
				: undefined;
		await options.writeArtifact?.({
			content:
				target.kind === 'json'
					? `${JSON.stringify(parseError ? { parseError, text } : body, null, 2)}\n`
					: text,
			name: `${safeArtifactName(target.name)}.${target.kind === 'json' ? 'json' : 'md'}`,
			target
		});

		return {
			body,
			bytes,
			elapsedMs: Math.round(now() - startedAt),
			error:
				parseError ??
				logicalFailure ??
				(missingText.length > 0
					? `Missing required text: ${missingText.join(', ')}`
					: undefined),
			kind: target.kind,
			method,
			name: target.name,
			ok:
				response.ok &&
				!parseError &&
				!logicalFailure &&
				missingText.length === 0,
			path: target.path,
			status: response.status,
			summary: parseError
				? { bytes, parseError }
				: target.kind === 'json'
					? (summarizeValue(body) as Record<string, unknown>)
					: {
							bytes,
							requiredTextFound: missingText.length === 0
						},
			url
		};
	} catch (error) {
		return {
			bytes: 0,
			elapsedMs: Math.round(now() - startedAt),
			error: error instanceof Error ? error.message : String(error),
			kind: target.kind,
			method,
			name: target.name,
			ok: false,
			path: target.path,
			url
		};
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
};

export const runVoiceProofTargets = (
	targets: VoiceProofTarget[],
	options: VoiceProofTargetRunOptions
) =>
	mapVoiceProofTargetsWithConcurrency(
		targets,
		options.concurrency ?? 2,
		(target) => fetchVoiceProofTarget(target, options)
	);
