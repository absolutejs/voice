import { Elysia } from 'elysia';
import type { S3Client, S3Options } from 'bun';
import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
	summarizeVoiceAuditSinkDeliveries,
	type VoiceAuditSinkDeliveryQueueSummary,
	type VoiceAuditSinkDeliveryRecord,
	type VoiceAuditSinkDeliveryStore
} from './auditSinks';
import type {
	StoredVoiceAuditEvent,
	VoiceAuditEventStore,
	VoiceAuditEventType
} from './audit';
import type { VoiceCallDebuggerReport } from './callDebugger';
import type { VoiceIncidentBundle } from './incidentBundle';
import type { VoiceIncidentRecoveryOutcomeReport } from './incidentTimeline';
import {
	buildVoiceOperationsRecord,
	type VoiceOperationsRecord,
	type VoiceOperationsRecordOptions
} from './operationsRecord';
import type { VoiceSessionSnapshot } from './sessionSnapshot';
import {
	summarizeVoiceTraceSinkDeliveries,
	type VoiceTraceSinkDeliveryQueueSummary
} from './queue';
import {
	summarizeVoiceTrace,
	type StoredVoiceTraceEvent,
	type VoiceTraceEventStore,
	type VoiceTraceEventType,
	type VoiceTraceRedactionConfig,
	type VoiceTraceSinkDeliveryRecord,
	type VoiceTraceSinkDeliveryStore,
	type VoiceTraceSummary
} from './trace';
import type { VoicePostgresClient } from './postgresStore';

export type VoiceObservabilityExportStatus = 'fail' | 'pass' | 'warn';

export const voiceObservabilityExportSchemaVersion = '1.0.0';
export const voiceObservabilityExportSchemaId =
	'com.absolutejs.voice.observability-export';

export type VoiceObservabilityExportSchema = {
	id: typeof voiceObservabilityExportSchemaId;
	version: typeof voiceObservabilityExportSchemaVersion;
};

export const createVoiceObservabilityExportSchema =
	(): VoiceObservabilityExportSchema => ({
		id: voiceObservabilityExportSchemaId,
		version: voiceObservabilityExportSchemaVersion
	});

export const assertVoiceObservabilityExportSchema = (input: {
	schema?: {
		id?: string;
		version?: string;
	};
}) => {
	if (
		input.schema?.id !== voiceObservabilityExportSchemaId ||
		input.schema?.version !== voiceObservabilityExportSchemaVersion
	) {
		throw new Error(
			`Unsupported voice observability export schema: ${input.schema?.id ?? 'missing'}@${input.schema?.version ?? 'missing'}`
		);
	}
};

export type VoiceObservabilityExportIngestedRecordKind =
	| 'artifact-index'
	| 'database-record'
	| 'delivery-history'
	| 'delivery-receipt'
	| 'delivery-report'
	| 'manifest';

export type VoiceObservabilityExportValidationIssue = {
	code:
		| 'voice.observability.export.invalid_shape'
		| 'voice.observability.export.missing_field'
		| 'voice.observability.export.unsupported_schema';
	message: string;
	path: string;
};

export type VoiceObservabilityExportValidationResult = {
	issues: VoiceObservabilityExportValidationIssue[];
	kind?: VoiceObservabilityExportIngestedRecordKind;
	ok: boolean;
	schema?: {
		id?: string;
		version?: string;
	};
};

export type VoiceObservabilityExportRecordValidationOptions = {
	kind?: VoiceObservabilityExportIngestedRecordKind;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isStatus = (value: unknown): value is VoiceObservabilityExportStatus =>
	value === 'fail' || value === 'pass' || value === 'warn';

const getRecord = (value: unknown, key: string) =>
	isRecord(value) && isRecord(value[key]) ? value[key] : undefined;

const getRecordArray = (value: unknown, key: string) =>
	isRecord(value) && Array.isArray(value[key]) ? value[key] : undefined;

const inferVoiceObservabilityExportRecordKind = (
	record: Record<string, unknown>
): VoiceObservabilityExportIngestedRecordKind | undefined => {
	if (isRecord(record.manifest) && isRecord(record.artifactIndex)) {
		return 'database-record';
	}
	if (Array.isArray(record.receipts)) {
		return 'delivery-history';
	}
	if (typeof record.runId === 'string' && Array.isArray(record.destinations)) {
		return 'delivery-receipt';
	}
	if (
		Array.isArray(record.destinations) &&
		isRecord(record.summary) &&
		typeof record.exportStatus === 'string'
	) {
		return 'delivery-report';
	}
	if (Array.isArray(record.artifacts) && isRecord(record.summary)) {
		return Array.isArray(record.envelopes) ? 'manifest' : 'artifact-index';
	}
	return undefined;
};

const pushValidationIssue = (
	issues: VoiceObservabilityExportValidationIssue[],
	issue: VoiceObservabilityExportValidationIssue
) => {
	issues.push(issue);
};

const requireRecordSchema = (
	issues: VoiceObservabilityExportValidationIssue[],
	record: Record<string, unknown>,
	path: string
) => {
	const schema = getRecord(record, 'schema') as
		| { id?: string; version?: string }
		| undefined;
	if (
		schema?.id !== voiceObservabilityExportSchemaId ||
		schema?.version !== voiceObservabilityExportSchemaVersion
	) {
		pushValidationIssue(issues, {
			code: 'voice.observability.export.unsupported_schema',
			message: `Unsupported voice observability export schema: ${schema?.id ?? 'missing'}@${schema?.version ?? 'missing'}`,
			path: `${path}.schema`
		});
	}
	return schema;
};

const requireArrayField = (
	issues: VoiceObservabilityExportValidationIssue[],
	record: Record<string, unknown>,
	key: string,
	path: string
) => {
	if (!Array.isArray(record[key])) {
		pushValidationIssue(issues, {
			code: 'voice.observability.export.missing_field',
			message: `${path}.${key} must be an array.`,
			path: `${path}.${key}`
		});
	}
};

const requireNumberField = (
	issues: VoiceObservabilityExportValidationIssue[],
	record: Record<string, unknown>,
	key: string,
	path: string
) => {
	if (typeof record[key] !== 'number') {
		pushValidationIssue(issues, {
			code: 'voice.observability.export.missing_field',
			message: `${path}.${key} must be a number.`,
			path: `${path}.${key}`
		});
	}
};

const requireStatusField = (
	issues: VoiceObservabilityExportValidationIssue[],
	record: Record<string, unknown>,
	key: string,
	path: string
) => {
	if (!isStatus(record[key])) {
		pushValidationIssue(issues, {
			code: 'voice.observability.export.missing_field',
			message: `${path}.${key} must be pass, warn, or fail.`,
			path: `${path}.${key}`
		});
	}
};

const requireDeliveryDestinationStatusField = (
	issues: VoiceObservabilityExportValidationIssue[],
	record: Record<string, unknown>,
	key: string,
	path: string
) => {
	if (record[key] !== 'delivered' && record[key] !== 'failed') {
		pushValidationIssue(issues, {
			code: 'voice.observability.export.missing_field',
			message: `${path}.${key} must be delivered or failed.`,
			path: `${path}.${key}`
		});
	}
};

const validateDeliveryDestinations = (
	issues: VoiceObservabilityExportValidationIssue[],
	destinations: unknown[] | undefined,
	path: string
) => {
	if (!destinations) {
		pushValidationIssue(issues, {
			code: 'voice.observability.export.missing_field',
			message: `${path} must be an array.`,
			path
		});
		return;
	}
	destinations.forEach((destination, index) => {
		const destinationPath = `${path}.${index}`;
		if (!isRecord(destination)) {
			pushValidationIssue(issues, {
				code: 'voice.observability.export.invalid_shape',
				message: `${destinationPath} must be an object.`,
				path: destinationPath
			});
			return;
		}
		requireRecordSchema(issues, destination, destinationPath);
		requireDeliveryDestinationStatusField(
			issues,
			destination,
			'status',
			destinationPath
		);
		if (typeof destination.destinationKind !== 'string') {
			pushValidationIssue(issues, {
				code: 'voice.observability.export.missing_field',
				message: `${destinationPath}.destinationKind must be a string.`,
				path: `${destinationPath}.destinationKind`
			});
		}
	});
};

export const validateVoiceObservabilityExportRecord = (
	input: unknown,
	options: VoiceObservabilityExportRecordValidationOptions = {}
): VoiceObservabilityExportValidationResult => {
	const issues: VoiceObservabilityExportValidationIssue[] = [];
	if (!isRecord(input)) {
		return {
			issues: [
				{
					code: 'voice.observability.export.invalid_shape',
					message: 'Voice observability export record must be an object.',
					path: '$'
				}
			],
			ok: false
		};
	}

	const kind =
		options.kind ?? inferVoiceObservabilityExportRecordKind(input);
	if (!kind) {
		return {
			issues: [
				{
					code: 'voice.observability.export.invalid_shape',
					message:
						'Voice observability export record kind could not be inferred.',
					path: '$'
				}
			],
			ok: false
		};
	}

	let schema: VoiceObservabilityExportValidationResult['schema'];
	if (kind === 'manifest') {
		schema = requireRecordSchema(issues, input, '$');
		requireArrayField(issues, input, 'artifacts', '$');
		requireArrayField(issues, input, 'envelopes', '$');
		requireArrayField(issues, input, 'issues', '$');
		requireArrayField(issues, input, 'operationsRecords', '$');
		requireArrayField(issues, input, 'sessionIds', '$');
		requireNumberField(issues, input, 'checkedAt', '$');
		requireStatusField(issues, input, 'status', '$');
		if (!isRecord(input.deliveries)) {
			pushValidationIssue(issues, {
				code: 'voice.observability.export.missing_field',
				message: '$.deliveries must be an object.',
				path: '$.deliveries'
			});
		}
		if (!isRecord(input.redaction)) {
			pushValidationIssue(issues, {
				code: 'voice.observability.export.missing_field',
				message: '$.redaction must be an object.',
				path: '$.redaction'
			});
		}
		if (!isRecord(input.summary)) {
			pushValidationIssue(issues, {
				code: 'voice.observability.export.missing_field',
				message: '$.summary must be an object.',
				path: '$.summary'
			});
		}
	} else if (kind === 'artifact-index') {
		schema = requireRecordSchema(issues, input, '$');
		requireArrayField(issues, input, 'artifacts', '$');
		requireNumberField(issues, input, 'checkedAt', '$');
		requireStatusField(issues, input, 'status', '$');
		if (!isRecord(input.summary)) {
			pushValidationIssue(issues, {
				code: 'voice.observability.export.missing_field',
				message: '$.summary must be an object.',
				path: '$.summary'
			});
		}
	} else if (kind === 'database-record') {
		schema = requireRecordSchema(issues, input, '$');
		requireNumberField(issues, input, 'checkedAt', '$');
		requireStatusField(issues, input, 'status', '$');
		requireStatusField(issues, input, 'exportStatus', '$');
		if (!isRecord(input.manifest)) {
			pushValidationIssue(issues, {
				code: 'voice.observability.export.missing_field',
				message: '$.manifest must be an object.',
				path: '$.manifest'
			});
		} else {
			issues.push(
				...validateVoiceObservabilityExportRecord(input.manifest, {
					kind: 'manifest'
				}).issues.map((issue) => ({
					...issue,
					path: `$.manifest${issue.path.slice(1)}`
				}))
			);
		}
		if (!isRecord(input.artifactIndex)) {
			pushValidationIssue(issues, {
				code: 'voice.observability.export.missing_field',
				message: '$.artifactIndex must be an object.',
				path: '$.artifactIndex'
			});
		} else {
			issues.push(
				...validateVoiceObservabilityExportRecord(input.artifactIndex, {
					kind: 'artifact-index'
				}).issues.map((issue) => ({
					...issue,
					path: `$.artifactIndex${issue.path.slice(1)}`
				}))
			);
		}
	} else if (kind === 'delivery-report') {
		requireNumberField(issues, input, 'checkedAt', '$');
		requireStatusField(issues, input, 'status', '$');
		requireStatusField(issues, input, 'exportStatus', '$');
		validateDeliveryDestinations(
			issues,
			getRecordArray(input, 'destinations'),
			'$.destinations'
		);
	} else if (kind === 'delivery-receipt') {
		requireNumberField(issues, input, 'checkedAt', '$');
		requireStatusField(issues, input, 'status', '$');
		requireStatusField(issues, input, 'exportStatus', '$');
		if (typeof input.runId !== 'string') {
			pushValidationIssue(issues, {
				code: 'voice.observability.export.missing_field',
				message: '$.runId must be a string.',
				path: '$.runId'
			});
		}
		validateDeliveryDestinations(
			issues,
			getRecordArray(input, 'destinations'),
			'$.destinations'
		);
	} else if (kind === 'delivery-history') {
		requireNumberField(issues, input, 'checkedAt', '$');
		requireStatusField(issues, input, 'status', '$');
		const receipts = getRecordArray(input, 'receipts');
		if (!receipts) {
			pushValidationIssue(issues, {
				code: 'voice.observability.export.missing_field',
				message: '$.receipts must be an array.',
				path: '$.receipts'
			});
		} else {
			receipts.forEach((receipt, index) => {
				const result = validateVoiceObservabilityExportRecord(receipt, {
					kind: 'delivery-receipt'
				});
				issues.push(
					...result.issues.map((issue) => ({
						...issue,
						path: `$.receipts.${index}${issue.path.slice(1)}`
					}))
				);
			});
		}
	}

	return {
		issues,
		kind,
		ok: issues.length === 0,
		schema
	};
};

export const assertVoiceObservabilityExportRecord = (
	input: unknown,
	options?: VoiceObservabilityExportRecordValidationOptions
) => {
	const result = validateVoiceObservabilityExportRecord(input, options);
	if (!result.ok) {
		const firstIssue = result.issues[0];
		throw new Error(
			`Invalid voice observability export record: ${firstIssue?.path ?? '$'} ${firstIssue?.message ?? 'unknown validation failure'}`
		);
	}
	return result;
};

export type VoiceObservabilityExportArtifactKind =
	| 'call-debugger'
	| 'incident'
	| 'incident-recovery-outcomes'
	| 'markdown'
	| 'operations-record'
	| 'proof-pack'
	| 'readiness'
	| 'screenshot'
	| 'session-snapshot'
	| 'slo'
	| 'trace'
	| 'audit'
	| 'custom';

export type VoiceObservabilityExportArtifactChecksum = {
	algorithm: 'sha256';
	value: string;
};

export type VoiceObservabilityExportArtifactFreshness = {
	ageMs?: number;
	checkedAt: number;
	generatedAt?: number | string;
	maxAgeMs?: number;
	status: VoiceObservabilityExportStatus;
};

export type VoiceObservabilityExportArtifact = {
	bytes?: number;
	checksum?: VoiceObservabilityExportArtifactChecksum;
	contentType?: string;
	downloadHref?: string;
	freshness?: VoiceObservabilityExportArtifactFreshness;
	generatedAt?: number | string;
	href?: string;
	id: string;
	kind: VoiceObservabilityExportArtifactKind;
	label: string;
	maxAgeMs?: number;
	metadata?: Record<string, unknown>;
	path?: string;
	required?: boolean;
	sessionId?: string;
	status?: VoiceObservabilityExportStatus;
};

export type VoiceObservabilityExportEnvelope = {
	at: number;
	eventId: string;
	eventType: VoiceTraceEventType | VoiceAuditEventType;
	kind: 'audit' | 'trace';
	operationsRecordHref?: string;
	provider?: string;
	providerKind?: string;
	scenarioId?: string;
	sessionId?: string;
	severity: VoiceObservabilityExportStatus;
	traceId?: string;
};

export type VoiceObservabilityExportIssueCode =
	| 'voice.observability.no_evidence'
	| 'voice.observability.operation_failed'
	| 'voice.observability.artifact_failed'
	| 'voice.observability.artifact_missing'
	| 'voice.observability.artifact_stale'
	| 'voice.observability.audit_delivery_failed'
	| 'voice.observability.audit_delivery_pending'
	| 'voice.observability.trace_delivery_failed'
	| 'voice.observability.trace_delivery_pending';

export type VoiceObservabilityExportIssue = {
	code: VoiceObservabilityExportIssueCode;
	detail?: string;
	label: string;
	severity: Exclude<VoiceObservabilityExportStatus, 'pass'>;
	value?: number | string;
};

export type VoiceObservabilityExportDeliverySummary = {
	audit?: VoiceAuditSinkDeliveryQueueSummary;
	trace?: VoiceTraceSinkDeliveryQueueSummary;
};

export type VoiceObservabilityExportRedactionSummary = {
	enabled: boolean;
	mode: 'none' | 'redacted';
};

export type VoiceObservabilityExportReport = {
	artifacts: VoiceObservabilityExportArtifact[];
	checkedAt: number;
	deliveries: VoiceObservabilityExportDeliverySummary;
	envelopes: VoiceObservabilityExportEnvelope[];
	issues: VoiceObservabilityExportIssue[];
	operationsRecords: VoiceOperationsRecord[];
	redaction: VoiceObservabilityExportRedactionSummary;
	schema: VoiceObservabilityExportSchema;
	sessionIds: string[];
	status: VoiceObservabilityExportStatus;
	summary: {
		auditEvents: number;
		events: number;
		failedOperationsRecords: number;
		trace: VoiceTraceSummary;
		traceEvents: number;
	};
};

export type VoiceObservabilityExportArtifactIndexItem = {
	bytes?: number;
	checksum?: VoiceObservabilityExportArtifactChecksum;
	contentType?: string;
	downloadHref?: string;
	freshness?: VoiceObservabilityExportArtifactFreshness;
	href?: string;
	id: string;
	kind: VoiceObservabilityExportArtifactKind;
	label: string;
	metadata?: Record<string, unknown>;
	required?: boolean;
	sessionId?: string;
	status?: VoiceObservabilityExportStatus;
};

export type VoiceObservabilityExportArtifactIndex = {
	artifacts: VoiceObservabilityExportArtifactIndexItem[];
	checkedAt: number;
	schema: VoiceObservabilityExportSchema;
	status: VoiceObservabilityExportStatus;
	summary: {
		downloadable: number;
		failed: number;
		required: number;
		total: number;
		warn: number;
	};
};

export type VoiceObservabilityExportDeliveryDestination =
	| {
			directory: string;
			id?: string;
			includeArtifacts?: boolean;
			kind: 'file';
			label?: string;
	  }
	| (S3Options & {
			bucket?: string;
			client?: Pick<S3Client, 'file'>;
			id?: string;
			includeArtifacts?: boolean;
			keyPrefix?: string;
			kind: 's3';
			label?: string;
	  })
	| {
			database?: Database;
			id?: string;
			kind: 'sqlite';
			label?: string;
			path?: string;
			tableName?: string;
	  }
	| {
			connectionString?: string;
			id?: string;
			kind: 'postgres';
			label?: string;
			schemaName?: string;
			sql?: VoicePostgresClient;
			tableName?: string;
	  }
	| {
			fetch?: typeof fetch;
			headers?: Record<string, string>;
			id?: string;
			includeArtifacts?: boolean;
			kind: 'webhook';
			label?: string;
			timeoutMs?: number;
			url: string;
	  };

export type VoiceObservabilityExportDeliveryDestinationResult = {
	artifactCount: number;
	deliveredAt: number;
	destinationId: string;
	destinationKind: VoiceObservabilityExportDeliveryDestination['kind'];
	error?: string;
	label: string;
	manifestBytes: number;
	schema: VoiceObservabilityExportSchema;
	status: 'delivered' | 'failed';
	target: string;
};

export type VoiceObservabilityExportDeliveryReport = {
	checkedAt: number;
	destinations: VoiceObservabilityExportDeliveryDestinationResult[];
	exportStatus: VoiceObservabilityExportStatus;
	status: VoiceObservabilityExportStatus;
	summary: {
		delivered: number;
		failed: number;
		total: number;
	};
};

export type VoiceObservabilityExportDeliveryReceipt = {
	checkedAt: number;
	destinations: VoiceObservabilityExportDeliveryDestinationResult[];
	exportStatus: VoiceObservabilityExportStatus;
	id: string;
	runId: string;
	status: VoiceObservabilityExportStatus;
	summary: VoiceObservabilityExportDeliveryReport['summary'];
};

export type VoiceObservabilityExportDeliveryReceiptStore = {
	get: (
		id: string
	) =>
		| Promise<VoiceObservabilityExportDeliveryReceipt | undefined>
		| VoiceObservabilityExportDeliveryReceipt
		| undefined;
	list: () =>
		| Promise<VoiceObservabilityExportDeliveryReceipt[]>
		| VoiceObservabilityExportDeliveryReceipt[];
	remove: (id: string) => Promise<void> | void;
	set: (
		id: string,
		receipt: VoiceObservabilityExportDeliveryReceipt
	) => Promise<void> | void;
};

export type VoiceObservabilityExportDeliveryHistory = {
	checkedAt: number;
	receipts: VoiceObservabilityExportDeliveryReceipt[];
	status: VoiceObservabilityExportStatus;
	summary: {
		delivered: number;
		failed: number;
		receipts: number;
		totalDestinations: number;
	};
};

export type VoiceObservabilityExportReplayIssueCode =
	| 'voice.observability.export_replay.artifact_failed'
	| 'voice.observability.export_replay.delivery_failed'
	| 'voice.observability.export_replay.export_failed'
	| 'voice.observability.export_replay.missing_record'
	| 'voice.observability.export_replay.validation_failed';

export type VoiceObservabilityExportReplayIssue = {
	code: VoiceObservabilityExportReplayIssueCode;
	detail?: string;
	label: string;
	severity: Exclude<VoiceObservabilityExportStatus, 'pass'>;
	value?: number | string;
};

export type VoiceObservabilityExportReplayRecords = {
	artifactIndex?: unknown;
	databaseRecord?: unknown;
	deliveryHistory?: unknown;
	deliveryReceipt?: unknown;
	deliveryReport?: unknown;
	manifest?: unknown;
};

export type VoiceObservabilityExportReplayReport = {
	checkedAt: number;
	issues: VoiceObservabilityExportReplayIssue[];
	records: {
		artifactIndex: VoiceObservabilityExportValidationResult;
		databaseRecord?: VoiceObservabilityExportValidationResult;
		deliveryHistory?: VoiceObservabilityExportValidationResult;
		deliveryReceipt?: VoiceObservabilityExportValidationResult;
		deliveryReport?: VoiceObservabilityExportValidationResult;
		manifest: VoiceObservabilityExportValidationResult;
	};
	status: VoiceObservabilityExportStatus;
	summary: {
		artifacts: number;
		deliveryDestinations: number;
		failedArtifacts: number;
		failedDeliveryDestinations: number;
		validationIssues: number;
	};
};

export type VoiceObservabilityExportDeliveryAssertionInput = {
	maxFailed?: number;
	maxFailedExportReceipts?: number;
	maxFailedReceipts?: number;
	maxLatestSuccessAgeMs?: number;
	minDelivered?: number;
	minReceipts?: number;
	minTotalDestinations?: number;
	now?: number;
	requireStatus?: VoiceObservabilityExportStatus;
	requiredDestinationIds?: string[];
	requiredDestinationKinds?: VoiceObservabilityExportDeliveryDestination['kind'][];
};

export type VoiceObservabilityExportDeliveryAssertionReport = {
	delivered: number;
	destinationIds: string[];
	destinationKinds: VoiceObservabilityExportDeliveryDestination['kind'][];
	failed: number;
	failedExportReceipts: number;
	failedReceipts: number;
	issues: string[];
	latestSuccessAgeMs?: number;
	ok: boolean;
	receipts: number;
	status: VoiceObservabilityExportStatus;
	totalDestinations: number;
};

export type VoiceObservabilityExportReplayAssertionInput = {
	maxFailedArtifacts?: number;
	maxFailedDeliveryDestinations?: number;
	maxIssues?: number;
	maxValidationIssues?: number;
	minArtifacts?: number;
	minDeliveryDestinations?: number;
	requireStatus?: VoiceObservabilityExportStatus;
	requiredRecordKinds?: VoiceObservabilityExportIngestedRecordKind[];
};

export type VoiceObservabilityExportReplayAssertionReport = {
	artifacts: number;
	deliveryDestinations: number;
	failedArtifacts: number;
	failedDeliveryDestinations: number;
	issues: string[];
	ok: boolean;
	recordKinds: VoiceObservabilityExportIngestedRecordKind[];
	replayIssues: number;
	status: VoiceObservabilityExportStatus;
	validationIssues: number;
};

export type VoiceObservabilityExportReplaySource =
	| {
			artifactIndex?: unknown;
			databaseRecord?: unknown;
			deliveryHistory?: unknown;
			deliveryReceipt?: unknown;
			deliveryReport?: unknown;
			kind: 'records';
			manifest?: unknown;
	  }
	| {
			directory: string;
			kind: 'file';
			receiptDirectory?: string;
			runId: string;
	  }
	| (S3Options & {
			client?: Pick<S3Client, 'file'>;
			keyPrefix?: string;
			kind: 's3';
			runId: string;
	  })
	| {
			database?: Database;
			kind: 'sqlite';
			path?: string;
			runId: string;
			tableName?: string;
	  }
	| {
			connectionString?: string;
			kind: 'postgres';
			runId: string;
			schemaName?: string;
			sql?: VoicePostgresClient;
			tableName?: string;
	  };

export type VoiceObservabilityExportReplayRoutesOptions = {
	headers?: HeadersInit;
	htmlPath?: false | string;
	name?: string;
	path?: string;
	render?: (
		report: VoiceObservabilityExportReplayReport
	) => string | Promise<string>;
	source:
		| VoiceObservabilityExportReplaySource
		| VoiceObservabilityExportReplayReport
		| (() =>
				| VoiceObservabilityExportReplaySource
				| VoiceObservabilityExportReplayReport
				| Promise<
						| VoiceObservabilityExportReplaySource
						| VoiceObservabilityExportReplayReport
				  >);
	title?: string;
};

export type VoiceObservabilityExportDeliveryOptions = {
	destinations: VoiceObservabilityExportDeliveryDestination[];
	report: VoiceObservabilityExportReport;
	receipts?: VoiceObservabilityExportDeliveryReceiptStore;
	runId?: string;
};

export type VoiceObservabilityExportOptions = {
	artifacts?: VoiceObservabilityExportArtifact[];
	artifactIntegrity?: {
		checksum?: false | 'sha256';
		maxAgeMs?: number;
		missingSeverity?: Exclude<VoiceObservabilityExportStatus, 'pass'>;
		now?: number;
		staleSeverity?: Exclude<VoiceObservabilityExportStatus, 'pass'>;
	};
	audit?: VoiceAuditEventStore;
	auditDeliveries?:
		| VoiceAuditSinkDeliveryRecord[]
		| VoiceAuditSinkDeliveryStore;
	events?: StoredVoiceTraceEvent[];
	includeOperationsRecords?: boolean;
	links?: {
		artifactDownload?: (artifact: VoiceObservabilityExportArtifact) => string;
		callDebugger?: (sessionId: string) => string;
		operationsRecord?: (sessionId: string) => string;
		sessionSnapshot?: (sessionId: string) => string;
	};
	callDebuggerReports?:
		| VoiceCallDebuggerReport[]
		| (() => VoiceCallDebuggerReport[] | Promise<VoiceCallDebuggerReport[]>);
	incidentBundles?:
		| VoiceIncidentBundle[]
		| (() => VoiceIncidentBundle[] | Promise<VoiceIncidentBundle[]>);
	incidentRecoveryOutcomeReports?:
		| VoiceIncidentRecoveryOutcomeReport[]
		| (() =>
				| VoiceIncidentRecoveryOutcomeReport[]
				| Promise<VoiceIncidentRecoveryOutcomeReport[]>);
	operationsRecords?: VoiceOperationsRecord[];
	onTiming?: (timing: VoiceObservabilityExportTiming) => void;
	redact?: VoiceTraceRedactionConfig;
	sessionIds?: string[];
	sessionSnapshots?:
		| VoiceSessionSnapshot[]
		| (() => VoiceSessionSnapshot[] | Promise<VoiceSessionSnapshot[]>);
	store?: VoiceTraceEventStore;
	traceDeliveries?:
		| VoiceTraceSinkDeliveryRecord[]
		| VoiceTraceSinkDeliveryStore;
};

export type VoiceObservabilityExportTiming = {
	durationMs: number;
	endedAt: number;
	label: string;
	startedAt: number;
};

export type VoiceObservabilityExportRoutesOptions =
	VoiceObservabilityExportOptions & {
		headers?: HeadersInit;
		artifactDownloadPath?: false | string;
		artifactIndex?:
			| VoiceObservabilityExportArtifactIndex
			| (() =>
					| VoiceObservabilityExportArtifactIndex
					| Promise<VoiceObservabilityExportArtifactIndex>);
		artifactIndexPath?: false | string;
		deliveryDestinations?: VoiceObservabilityExportDeliveryDestination[];
		deliveryPath?: false | string;
		deliveryReceipts?: VoiceObservabilityExportDeliveryReceiptStore;
		htmlPath?: false | string;
		markdownPath?: false | string;
		name?: string;
		path?: string;
		render?: (
			report: VoiceObservabilityExportReport
		) => string | Promise<string>;
		title?: string;
	};

const resolveVoiceObservabilityArtifactIndex = async (
	source:
		| VoiceObservabilityExportArtifactIndex
		| (() =>
				| VoiceObservabilityExportArtifactIndex
				| Promise<VoiceObservabilityExportArtifactIndex>)
) => (typeof source === 'function' ? await source() : source);

const isDeliveryStore = <TDelivery>(
	value: TDelivery[] | { list: () => TDelivery[] | Promise<TDelivery[]> }
): value is { list: () => TDelivery[] | Promise<TDelivery[]> } =>
	!Array.isArray(value) && typeof value.list === 'function';

const getString = (value: unknown) =>
	typeof value === 'string' ? value : undefined;

const getProviderKind = (payload: Record<string, unknown>) =>
	getString(payload.kind) ?? getString(payload.providerKind);

const toSeverityFromTrace = (
	event: StoredVoiceTraceEvent
): VoiceObservabilityExportStatus => {
	if (
		event.type === 'session.error' ||
		event.payload.status === 'error' ||
		event.payload.providerStatus === 'error'
	) {
		return 'fail';
	}
	if (
		event.payload.status === 'fallback' ||
		event.payload.providerStatus === 'fallback'
	) {
		return 'warn';
	}
	return 'pass';
};

const toSeverityFromAudit = (
	event: StoredVoiceAuditEvent
): VoiceObservabilityExportStatus =>
	event.outcome === 'error'
		? 'fail'
		: event.outcome === 'skipped'
			? 'warn'
			: 'pass';

const createOperationArtifact = (
	record: VoiceOperationsRecord,
	href?: string
): VoiceObservabilityExportArtifact => ({
	generatedAt: record.checkedAt,
	href,
	id: `operations-record:${record.sessionId}`,
	kind: 'operations-record',
	label: `Operations record ${record.sessionId}`,
	sessionId: record.sessionId,
	status:
		record.status === 'failed'
			? 'fail'
			: record.status === 'warning'
				? 'warn'
				: 'pass'
});

const createSessionSnapshotArtifact = (
	snapshot: VoiceSessionSnapshot,
	href?: string
): VoiceObservabilityExportArtifact => ({
	generatedAt: snapshot.capturedAt,
	href,
	id: `session-snapshot:${snapshot.sessionId}`,
	kind: 'session-snapshot',
	label: `Session snapshot ${snapshot.sessionId}`,
	metadata: {
		snapshotStatus: snapshot.status
	},
	sessionId: snapshot.sessionId,
	status: 'pass'
});

const createCallDebuggerArtifact = (
	report: VoiceCallDebuggerReport,
	href?: string
): VoiceObservabilityExportArtifact => ({
	generatedAt: report.checkedAt,
	href,
	id: `call-debugger:${report.sessionId}`,
	kind: 'call-debugger',
	label: `Call debugger ${report.sessionId}`,
	metadata: {
		callDebuggerStatus: report.status,
		operationsRecordStatus: report.operationsRecord?.status,
		snapshotStatus: report.snapshot?.status
	},
	sessionId: report.sessionId,
	status: 'pass'
});

const createIncidentBundleArtifact = (
	bundle: VoiceIncidentBundle
): VoiceObservabilityExportArtifact => ({
	generatedAt: bundle.exportedAt,
	id: `incident-bundle:${bundle.sessionId}`,
	kind: 'incident',
	label: `Incident bundle ${bundle.sessionId}`,
	metadata: {
		errors: bundle.summary.errors,
		recoveryOutcomes: bundle.recoveryOutcomes
			? {
					failed: bundle.recoveryOutcomes.failed,
					improved: bundle.recoveryOutcomes.improved,
					regressed: bundle.recoveryOutcomes.regressed,
					total: bundle.recoveryOutcomes.total,
					unchanged: bundle.recoveryOutcomes.unchanged
				}
			: undefined,
		status: bundle.summary.status
	},
	required: true,
	sessionId: bundle.sessionId,
	status:
		bundle.summary.status === 'failed'
			? 'fail'
			: bundle.summary.status === 'warning'
				? 'warn'
				: 'pass'
});

const createIncidentRecoveryOutcomeArtifact = (
	report: VoiceIncidentRecoveryOutcomeReport
): VoiceObservabilityExportArtifact => ({
	generatedAt: report.checkedAt,
	id: `incident-recovery-outcomes:${report.checkedAt}`,
	kind: 'incident-recovery-outcomes',
	label: 'Incident recovery outcomes',
	metadata: {
		failed: report.failed,
		improved: report.improved,
		regressed: report.regressed,
		total: report.total,
		unchanged: report.unchanged
	},
	required: true,
	status:
		report.failed > 0 || report.regressed > 0
			? 'fail'
			: report.unchanged > 0
				? 'warn'
				: 'pass'
});

const unique = (values: string[]) => [...new Set(values)].sort();

const stripArtifactPathAnchor = (path: string) => path.split('#')[0] ?? path;

const toEpochMs = (value: number | string | undefined) => {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : undefined;
	}
	if (typeof value === 'string') {
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
};

const checksumFile = async (path: string): Promise<string> => {
	const buffer = await readFile(path);
	return createHash('sha256').update(buffer).digest('hex');
};

const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

const deliveryReceiptId = (runId: string) =>
	`observability-export:${encodeURIComponent(runId)}`;

const safeArtifactFileName = (artifact: VoiceObservabilityExportArtifact) => {
	const extension =
		artifact.contentType === 'image/png'
			? '.png'
			: artifact.contentType?.includes('markdown')
				? '.md'
				: artifact.contentType?.includes('json')
					? '.json'
					: '';
	return `${artifact.id.replace(/[^a-z0-9_.-]/gi, '-')}${extension}`;
};

const normalizeExportS3KeyPrefix = (prefix?: string) =>
	prefix?.trim().replace(/^\/+|\/+$/g, '') ?? 'voice/observability-exports';

const joinS3Key = (...parts: string[]) =>
	parts
		.map((part) => part.trim().replace(/^\/+|\/+$/g, ''))
		.filter(Boolean)
		.join('/');

const writeS3Object = async (input: {
	client: Pick<S3Client, 'file'>;
	contentType: string;
	key: string;
	options: S3Options;
	value: string | Uint8Array;
}) => {
	const file = input.client.file(input.key, input.options) as {
		write: (
			data: string | Uint8Array,
			options?: BlobPropertyBag
		) => Promise<number> | number;
	};
	await file.write(input.value, {
		type: input.contentType
	});
};

const readS3ObjectText = async (input: {
	client: Pick<S3Client, 'file'>;
	key: string;
	options: S3Options;
}) => {
	const file = input.client.file(input.key, input.options) as {
		text: () => Promise<string> | string;
	};
	return await file.text();
};

const quoteObservabilityIdentifier = (value: string) =>
	`"${value.replace(/"/g, '""')}"`;

const normalizeObservabilityIdentifier = (value: string | undefined) =>
	value
		?.trim()
		.replace(/[^a-zA-Z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '') || 'voice_observability_exports';

const buildObservabilityExportDatabaseRecord = (input: {
	artifactIndex: VoiceObservabilityExportArtifactIndex;
	checkedAt: number;
	index: string;
	manifest: string;
	report: VoiceObservabilityExportReport;
	runId: string;
}) => ({
	artifactCount: input.artifactIndex.summary.total,
	artifactIndex: input.artifactIndex,
	checkedAt: input.checkedAt,
	exportStatus: input.report.status,
	manifest: input.report,
	runId: input.runId,
	schema: input.report.schema,
	status: input.report.status
});

const parseObservabilityExportJson = (value: unknown) =>
	typeof value === 'string' ? JSON.parse(value) : value;

const collectReplayDeliveryDestinations = (
	value: unknown
): VoiceObservabilityExportDeliveryDestinationResult[] => {
	if (!isRecord(value)) {
		return [];
	}
	if (Array.isArray(value.destinations)) {
		return value.destinations.filter(
			(destination): destination is VoiceObservabilityExportDeliveryDestinationResult =>
				isRecord(destination)
		);
	}
	if (Array.isArray(value.receipts)) {
		return value.receipts.flatMap((receipt) =>
			collectReplayDeliveryDestinations(receipt)
		);
	}
	return [];
};

const replayIssueSeverity = (
	status: VoiceObservabilityExportStatus | undefined
): Exclude<VoiceObservabilityExportStatus, 'pass'> =>
	status === 'fail' ? 'fail' : 'warn';

export const buildVoiceObservabilityExportReplayReport = (
	records: VoiceObservabilityExportReplayRecords
): VoiceObservabilityExportReplayReport => {
	const manifest =
		records.manifest ??
		(isRecord(records.databaseRecord) ? records.databaseRecord.manifest : undefined);
	const artifactIndex =
		records.artifactIndex ??
		(isRecord(records.databaseRecord)
			? records.databaseRecord.artifactIndex
			: undefined);
	const validations = {
		artifactIndex: validateVoiceObservabilityExportRecord(artifactIndex, {
			kind: 'artifact-index'
		}),
		databaseRecord: records.databaseRecord
			? validateVoiceObservabilityExportRecord(records.databaseRecord, {
					kind: 'database-record'
				})
			: undefined,
		deliveryHistory: records.deliveryHistory
			? validateVoiceObservabilityExportRecord(records.deliveryHistory, {
					kind: 'delivery-history'
				})
			: undefined,
		deliveryReceipt: records.deliveryReceipt
			? validateVoiceObservabilityExportRecord(records.deliveryReceipt, {
					kind: 'delivery-receipt'
				})
			: undefined,
		deliveryReport: records.deliveryReport
			? validateVoiceObservabilityExportRecord(records.deliveryReport, {
					kind: 'delivery-report'
				})
			: undefined,
		manifest: validateVoiceObservabilityExportRecord(manifest, {
			kind: 'manifest'
		})
	};
	const validationIssues = Object.entries(validations).flatMap(
		([kind, result]) =>
			result?.issues.map((issue) => ({
				kind,
				issue
			})) ?? []
	);
	const manifestRecord = isRecord(manifest)
		? (manifest as Partial<VoiceObservabilityExportReport>)
		: undefined;
	const artifactIndexRecord = isRecord(artifactIndex)
		? (artifactIndex as Partial<VoiceObservabilityExportArtifactIndex>)
		: undefined;
	const artifacts = [
		...(Array.isArray(manifestRecord?.artifacts)
			? manifestRecord.artifacts
			: []),
		...(Array.isArray(artifactIndexRecord?.artifacts)
			? artifactIndexRecord.artifacts
			: [])
	].filter((artifact): artifact is VoiceObservabilityExportArtifact =>
		isRecord(artifact)
	);
	const failedArtifacts = artifacts.filter(
		(artifact) => artifact.status === 'fail'
	);
	const deliveryDestinations = [
		...collectReplayDeliveryDestinations(records.deliveryReport),
		...collectReplayDeliveryDestinations(records.deliveryReceipt),
		...collectReplayDeliveryDestinations(records.deliveryHistory)
	];
	const failedDeliveryDestinations = deliveryDestinations.filter(
		(destination) => destination.status === 'failed'
	);
	const issues: VoiceObservabilityExportReplayIssue[] = [
		...(!records.manifest && !isRecord(records.databaseRecord)
			? [
					{
						code: 'voice.observability.export_replay.missing_record' as const,
						label: 'Export manifest',
						severity: 'fail' as const,
						value: 'manifest'
					}
				]
			: []),
		...(!records.artifactIndex && !isRecord(records.databaseRecord)
			? [
					{
						code: 'voice.observability.export_replay.missing_record' as const,
						label: 'Artifact index',
						severity: 'fail' as const,
						value: 'artifact-index'
					}
				]
			: []),
		...validationIssues.map(({ kind, issue }) => ({
			code: 'voice.observability.export_replay.validation_failed' as const,
			detail: issue.message,
			label: `Invalid ${kind}`,
			severity: 'fail' as const,
			value: issue.path
		})),
		...(manifestRecord &&
		(manifestRecord.status === 'fail' || manifestRecord.status === 'warn')
			? [
					{
						code: 'voice.observability.export_replay.export_failed' as const,
						label: 'Export manifest status',
						severity: replayIssueSeverity(manifestRecord.status),
						value: manifestRecord.status
					}
				]
			: []),
		...failedArtifacts.map((artifact) => ({
			code: 'voice.observability.export_replay.artifact_failed' as const,
			label: 'Export artifact status',
			severity: 'fail' as const,
			value: artifact.id
		})),
		...failedDeliveryDestinations.map((destination) => ({
			code: 'voice.observability.export_replay.delivery_failed' as const,
			label: 'Export delivery destination',
			severity: 'fail' as const,
			value: destination.destinationId
		}))
	];

	return {
		checkedAt: Date.now(),
		issues,
		records: validations,
		status: issues.some((issue) => issue.severity === 'fail')
			? 'fail'
			: issues.some((issue) => issue.severity === 'warn')
				? 'warn'
				: 'pass',
		summary: {
			artifacts: new Set(artifacts.map((artifact) => artifact.id)).size,
			deliveryDestinations: deliveryDestinations.length,
			failedArtifacts: failedArtifacts.length,
			failedDeliveryDestinations: failedDeliveryDestinations.length,
			validationIssues: validationIssues.length
		}
	};
};

export const evaluateVoiceObservabilityExportReplayEvidence = (
	report: VoiceObservabilityExportReplayReport,
	input: VoiceObservabilityExportReplayAssertionInput = {}
): VoiceObservabilityExportReplayAssertionReport => {
	const issues: string[] = [];
	const requiredStatus = input.requireStatus ?? 'pass';
	const maxIssues = input.maxIssues ?? 0;
	const maxValidationIssues = input.maxValidationIssues ?? 0;
	const maxFailedArtifacts = input.maxFailedArtifacts ?? 0;
	const maxFailedDeliveryDestinations =
		input.maxFailedDeliveryDestinations ?? 0;
	const minArtifacts = input.minArtifacts ?? 1;
	const minDeliveryDestinations = input.minDeliveryDestinations;
	const recordKinds = Object.values(report.records)
		.map((record) => record?.kind)
		.filter((kind): kind is VoiceObservabilityExportIngestedRecordKind =>
			Boolean(kind)
		)
		.sort();

	if (report.status !== requiredStatus) {
		issues.push(
			`Expected observability export replay status ${requiredStatus}, found ${report.status}.`
		);
	}
	if (report.issues.length > maxIssues) {
		issues.push(
			`Expected at most ${String(maxIssues)} observability export replay issue(s), found ${String(report.issues.length)}.`
		);
	}
	if (report.summary.validationIssues > maxValidationIssues) {
		issues.push(
			`Expected at most ${String(maxValidationIssues)} observability export replay validation issue(s), found ${String(report.summary.validationIssues)}.`
		);
	}
	if (report.summary.failedArtifacts > maxFailedArtifacts) {
		issues.push(
			`Expected at most ${String(maxFailedArtifacts)} failed observability export artifact(s), found ${String(report.summary.failedArtifacts)}.`
		);
	}
	if (
		report.summary.failedDeliveryDestinations >
		maxFailedDeliveryDestinations
	) {
		issues.push(
			`Expected at most ${String(maxFailedDeliveryDestinations)} failed observability export delivery destination(s), found ${String(report.summary.failedDeliveryDestinations)}.`
		);
	}
	if (report.summary.artifacts < minArtifacts) {
		issues.push(
			`Expected at least ${String(minArtifacts)} replayed observability export artifact(s), found ${String(report.summary.artifacts)}.`
		);
	}
	if (
		minDeliveryDestinations !== undefined &&
		report.summary.deliveryDestinations < minDeliveryDestinations
	) {
		issues.push(
			`Expected at least ${String(minDeliveryDestinations)} replayed observability export delivery destination(s), found ${String(report.summary.deliveryDestinations)}.`
		);
	}
	for (const recordKind of input.requiredRecordKinds ?? []) {
		if (!recordKinds.includes(recordKind)) {
			issues.push(
				`Missing observability export replay record kind: ${recordKind}.`
			);
		}
	}

	return {
		artifacts: report.summary.artifacts,
		deliveryDestinations: report.summary.deliveryDestinations,
		failedArtifacts: report.summary.failedArtifacts,
		failedDeliveryDestinations: report.summary.failedDeliveryDestinations,
		issues,
		ok: issues.length === 0,
		recordKinds,
		replayIssues: report.issues.length,
		status: report.status,
		validationIssues: report.summary.validationIssues
	};
};

export const assertVoiceObservabilityExportReplayEvidence = (
	report: VoiceObservabilityExportReplayReport,
	input: VoiceObservabilityExportReplayAssertionInput = {}
): VoiceObservabilityExportReplayAssertionReport => {
	const assertion = evaluateVoiceObservabilityExportReplayEvidence(
		report,
		input
	);
	if (!assertion.ok) {
		throw new Error(
			`Voice observability export replay assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
};

export const loadVoiceObservabilityExportReplaySource = async (
	source: VoiceObservabilityExportReplaySource
): Promise<VoiceObservabilityExportReplayRecords> => {
	if (source.kind === 'records') {
		return source;
	}

	if (source.kind === 'file') {
		const root = join(source.directory, source.runId);
		const receiptPath = source.receiptDirectory
			? join(
					source.receiptDirectory,
					`${encodeURIComponent(deliveryReceiptId(source.runId))}.json`
				)
			: undefined;
		const deliveryReceipt = receiptPath
			? await Bun.file(receiptPath)
					.text()
					.then(JSON.parse)
					.catch(() => undefined)
			: undefined;

		return {
			artifactIndex: JSON.parse(
				await Bun.file(join(root, 'artifact-index.json')).text()
			),
			deliveryReceipt,
			manifest: JSON.parse(await Bun.file(join(root, 'manifest.json')).text())
		};
	}

	if (source.kind === 's3') {
		const client = source.client ?? new Bun.S3Client(source);
		const s3Options = source as S3Options;
		const rootKey = joinS3Key(
			normalizeExportS3KeyPrefix(source.keyPrefix),
			source.runId
		);
		return {
			artifactIndex: JSON.parse(
				await readS3ObjectText({
					client,
					key: joinS3Key(rootKey, 'artifact-index.json'),
					options: s3Options
				})
			),
			manifest: JSON.parse(
				await readS3ObjectText({
					client,
					key: joinS3Key(rootKey, 'manifest.json'),
					options: s3Options
				})
			)
		};
	}

	if (source.kind === 'sqlite') {
		if (!source.database && !source.path) {
			throw new Error(
				'SQLite observability export replay requires source.database or source.path.'
			);
		}
		const database =
			source.database ?? new Database(source.path as string, { create: false });
		const table = quoteObservabilityIdentifier(
			normalizeObservabilityIdentifier(source.tableName)
		);
		const row = database
			.query(
				`SELECT manifest_json, artifact_index_json, payload_json FROM ${table} WHERE run_id = $runId`
			)
			.get({ $runId: source.runId }) as
			| {
					artifact_index_json?: string;
					manifest_json?: string;
					payload_json?: string;
			  }
			| undefined;
		if (!row) {
			throw new Error(`No observability export found for run ${source.runId}.`);
		}
		return {
			artifactIndex: parseObservabilityExportJson(row.artifact_index_json),
			databaseRecord: parseObservabilityExportJson(row.payload_json),
			manifest: parseObservabilityExportJson(row.manifest_json)
		};
	}

	const sql =
		source.sql ??
		(source.connectionString
			? (() => {
					const client = new Bun.SQL(source.connectionString);
					return { unsafe: client.unsafe.bind(client) };
				})()
			: undefined);
	if (!sql) {
		throw new Error(
			'Postgres observability export replay requires source.sql or source.connectionString.'
		);
	}
	const schema = normalizeObservabilityIdentifier(source.schemaName ?? 'public');
	const table = normalizeObservabilityIdentifier(source.tableName);
	const qualifiedTable = `${quoteObservabilityIdentifier(schema)}.${quoteObservabilityIdentifier(table)}`;
	const rows = (await sql.unsafe(
		`SELECT manifest_json, artifact_index_json, payload FROM ${qualifiedTable} WHERE run_id = $1`,
		[source.runId]
	)) as Array<{
		artifact_index_json?: unknown;
		manifest_json?: unknown;
		payload?: unknown;
	}>;
	const row = rows[0];
	if (!row) {
		throw new Error(`No observability export found for run ${source.runId}.`);
	}
	return {
		artifactIndex: parseObservabilityExportJson(row.artifact_index_json),
		databaseRecord: parseObservabilityExportJson(row.payload),
		manifest: parseObservabilityExportJson(row.manifest_json)
	};
};

export const replayVoiceObservabilityExport = async (
	source: VoiceObservabilityExportReplaySource
) =>
	buildVoiceObservabilityExportReplayReport(
		await loadVoiceObservabilityExportReplaySource(source)
	);

const escapeObservabilityReplayHtml = (value: unknown) =>
	String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

const isVoiceObservabilityExportReplayReport = (
	value: unknown
): value is VoiceObservabilityExportReplayReport =>
	isRecord(value) &&
	isRecord(value.summary) &&
	isRecord(value.records) &&
	Array.isArray(value.issues) &&
	typeof value.checkedAt === 'number' &&
	isStatus(value.status);

const resolveVoiceObservabilityExportReplayReport = async (
	input:
		| VoiceObservabilityExportReplayRoutesOptions['source']
		| VoiceObservabilityExportReplaySource
		| VoiceObservabilityExportReplayReport
) => {
	const resolved = typeof input === 'function' ? await input() : input;
	return isVoiceObservabilityExportReplayReport(resolved)
		? resolved
		: replayVoiceObservabilityExport(resolved);
};

export const renderVoiceObservabilityExportReplayHTML = (
	report: VoiceObservabilityExportReplayReport,
	options: {
		title?: string;
	} = {}
) => {
	const title = options.title ?? 'Voice Observability Export Replay';
	const issues =
		report.issues
			.map(
				(issue) =>
					`<tr><td>${escapeObservabilityReplayHtml(issue.severity)}</td><td>${escapeObservabilityReplayHtml(issue.label)}</td><td>${escapeObservabilityReplayHtml(issue.value ?? '')}</td><td>${escapeObservabilityReplayHtml(issue.detail ?? '')}</td></tr>`
			)
			.join('') ||
		'<tr><td colspan="4">No replay issues.</td></tr>';
	const records = Object.entries(report.records)
		.map(
			([kind, result]) =>
				`<tr><td>${escapeObservabilityReplayHtml(kind)}</td><td>${escapeObservabilityReplayHtml(result ? (result.ok ? 'valid' : 'invalid') : 'not present')}</td><td>${escapeObservabilityReplayHtml(result?.issues.length ?? 0)}</td><td>${escapeObservabilityReplayHtml(result?.schema ? `${result.schema.id ?? 'missing'}@${result.schema.version ?? 'missing'}` : 'not present')}</td></tr>`
		)
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeObservabilityReplayHtml(title)}</title><style>body{background:#0d1117;color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:1060px;padding:32px}.hero{background:linear-gradient(135deg,rgba(34,197,94,.16),rgba(14,165,233,.12));border:1px solid #263241;border-radius:26px;margin-bottom:18px;padding:28px}.eyebrow{color:#67e8f9;font-size:.78rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.1rem,5vw,4.2rem);line-height:.95;margin:.2rem 0 1rem}.status{border:1px solid #334155;border-radius:999px;display:inline-flex;font-weight:800;padding:8px 12px;text-transform:uppercase}.pass{color:#86efac}.warn{color:#fde68a}.fail{color:#fca5a5}.metrics{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin:18px 0}.metrics article,table,.primitive{background:#151b23;border:1px solid #263241;border-radius:18px}.metrics article,.primitive{padding:16px}.metrics span{color:#a8b0b8}.metrics strong{display:block;font-size:2rem;margin-top:.25rem}.primitive{margin:0 0 18px}.primitive p{color:#cbd5e1;line-height:1.55}table{border-collapse:collapse;margin-bottom:18px;overflow:hidden;width:100%}td,th{border-bottom:1px solid #263241;padding:12px;text-align:left}code{color:#bfdbfe}@media(max-width:760px){main{padding:20px}}</style></head><body><main><section class="hero"><p class="eyebrow">Customer-owned observability proof</p><h1>${escapeObservabilityReplayHtml(title)}</h1><p>This page reads back a delivered observability export and validates the manifest, artifact index, delivery evidence, and schema contract from storage you own.</p><p class="status ${escapeObservabilityReplayHtml(report.status)}">Status: ${escapeObservabilityReplayHtml(report.status)}</p><section class="metrics"><article><span>Artifacts</span><strong>${report.summary.artifacts}</strong></article><article><span>Delivery destinations</span><strong>${report.summary.deliveryDestinations}</strong></article><article><span>Validation issues</span><strong>${report.summary.validationIssues}</strong></article><article><span>Failed artifacts</span><strong>${report.summary.failedArtifacts}</strong></article></section></section><section class="primitive"><p class="eyebrow">Primitive</p><p><code>createVoiceObservabilityExportReplayRoutes(...)</code> gives self-hosted apps a readable replay proof and a JSON report for CI, release gates, SIEM ingestion, or customer evidence packets.</p></section><h2>Records</h2><table><thead><tr><th>Record</th><th>Status</th><th>Issues</th><th>Schema</th></tr></thead><tbody>${records}</tbody></table><h2>Issues</h2><table><thead><tr><th>Severity</th><th>Label</th><th>Value</th><th>Detail</th></tr></thead><tbody>${issues}</tbody></table><p>Checked at ${escapeObservabilityReplayHtml(new Date(report.checkedAt).toISOString())}</p></main></body></html>`;
};

export const createVoiceObservabilityExportReplayRoutes = (
	options: VoiceObservabilityExportReplayRoutesOptions
) => {
	const path = options.path ?? '/api/voice/observability-export/replay';
	const htmlPath = options.htmlPath ?? '/voice/observability-export/replay';
	const headers = {
		'cache-control': 'no-store',
		...(options.headers ?? {})
	};
	const buildReport = () =>
		resolveVoiceObservabilityExportReplayReport(options.source);
	const app = new Elysia({
		name: options.name ?? 'absolute-voice-observability-export-replay'
	});

	app.get(path, async () => Response.json(await buildReport(), { headers }));

	if (htmlPath !== false) {
		app.get(htmlPath, async () => {
			const report = await buildReport();
			return new Response(
				options.render
					? await options.render(report)
					: renderVoiceObservabilityExportReplayHTML(report, {
							title: options.title
						}),
				{
					headers: {
						...headers,
						'content-type': 'text/html; charset=utf-8'
					}
				}
			);
		});
	}

	return app;
};

const deliverObservabilityExportToSQLite = async (input: {
	artifactIndex: VoiceObservabilityExportArtifactIndex;
	checkedAt: number;
	destination: Extract<
		VoiceObservabilityExportDeliveryDestination,
		{ kind: 'sqlite' }
	>;
	index: string;
	manifest: string;
	report: VoiceObservabilityExportReport;
	runId: string;
}) => {
	if (!input.destination.database && !input.destination.path) {
		throw new Error(
			'SQLite observability export delivery requires destination.database or destination.path.'
		);
	}

	const database =
		input.destination.database ??
		new Database(input.destination.path as string, { create: true });
	const table = quoteObservabilityIdentifier(
		normalizeObservabilityIdentifier(input.destination.tableName)
	);
	const record = buildObservabilityExportDatabaseRecord(input);
	database.exec(
		`CREATE TABLE IF NOT EXISTS ${table} (
			run_id TEXT PRIMARY KEY,
			checked_at INTEGER NOT NULL,
			status TEXT NOT NULL,
			export_status TEXT NOT NULL,
			artifact_count INTEGER NOT NULL,
			manifest_json TEXT NOT NULL,
			artifact_index_json TEXT NOT NULL,
			payload_json TEXT NOT NULL
		)`
	);
	database
		.query(
			`INSERT INTO ${table}
			 (run_id, checked_at, status, export_status, artifact_count, manifest_json, artifact_index_json, payload_json)
			 VALUES ($runId, $checkedAt, $status, $exportStatus, $artifactCount, $manifest, $artifactIndex, $payload)
			 ON CONFLICT(run_id) DO UPDATE SET
				checked_at = excluded.checked_at,
				status = excluded.status,
				export_status = excluded.export_status,
				artifact_count = excluded.artifact_count,
				manifest_json = excluded.manifest_json,
				artifact_index_json = excluded.artifact_index_json,
				payload_json = excluded.payload_json`
		)
		.run({
			$artifactCount: input.artifactIndex.summary.total,
			$artifactIndex: input.index,
			$checkedAt: input.checkedAt,
			$exportStatus: input.report.status,
			$manifest: input.manifest,
			$payload: JSON.stringify(record),
			$runId: input.runId,
			$status: input.report.status
		});

	return input.destination.path
		? `sqlite://${input.destination.path}/${table.replaceAll('"', '')}`
		: `sqlite://memory/${table.replaceAll('"', '')}`;
};

const deliverObservabilityExportToPostgres = async (input: {
	artifactIndex: VoiceObservabilityExportArtifactIndex;
	checkedAt: number;
	destination: Extract<
		VoiceObservabilityExportDeliveryDestination,
		{ kind: 'postgres' }
	>;
	index: string;
	manifest: string;
	report: VoiceObservabilityExportReport;
	runId: string;
}) => {
	const sql =
		input.destination.sql ??
		(input.destination.connectionString
			? (() => {
					const client = new Bun.SQL(input.destination.connectionString);
					return { unsafe: client.unsafe.bind(client) };
				})()
			: undefined);
	if (!sql) {
		throw new Error(
			'Postgres observability export delivery requires destination.sql or destination.connectionString.'
		);
	}

	const schema = normalizeObservabilityIdentifier(
		input.destination.schemaName ?? 'public'
	);
	const table = normalizeObservabilityIdentifier(input.destination.tableName);
	const qualifiedTable = `${quoteObservabilityIdentifier(schema)}.${quoteObservabilityIdentifier(table)}`;
	const record = buildObservabilityExportDatabaseRecord(input);

	await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${quoteObservabilityIdentifier(schema)}`);
	await sql.unsafe(
		`CREATE TABLE IF NOT EXISTS ${qualifiedTable} (
			run_id TEXT PRIMARY KEY,
			checked_at BIGINT NOT NULL,
			status TEXT NOT NULL,
			export_status TEXT NOT NULL,
			artifact_count INTEGER NOT NULL,
			manifest_json JSONB NOT NULL,
			artifact_index_json JSONB NOT NULL,
			payload JSONB NOT NULL
		)`
	);
	await sql.unsafe(
		`INSERT INTO ${qualifiedTable}
		 (run_id, checked_at, status, export_status, artifact_count, manifest_json, artifact_index_json, payload)
		 VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
		 ON CONFLICT (run_id) DO UPDATE SET
			checked_at = EXCLUDED.checked_at,
			status = EXCLUDED.status,
			export_status = EXCLUDED.export_status,
			artifact_count = EXCLUDED.artifact_count,
			manifest_json = EXCLUDED.manifest_json,
			artifact_index_json = EXCLUDED.artifact_index_json,
			payload = EXCLUDED.payload`,
		[
			input.runId,
			input.checkedAt,
			input.report.status,
			input.report.status,
			input.artifactIndex.summary.total,
			input.manifest,
			input.index,
			JSON.stringify(record)
		]
	);

	return `postgres://${schema}/${table}`;
};

const observabilityExportDeliveryFailureTarget = (
	destination: VoiceObservabilityExportDeliveryDestination
) => {
	if (destination.kind === 'file') {
		return destination.directory;
	}
	if (destination.kind === 's3') {
		return destination.bucket
			? `s3://${destination.bucket}/${normalizeExportS3KeyPrefix(destination.keyPrefix)}`
			: normalizeExportS3KeyPrefix(destination.keyPrefix);
	}
	if (destination.kind === 'sqlite') {
		return destination.path ?? 'sqlite://memory';
	}
	if (destination.kind === 'postgres') {
		return destination.connectionString ?? 'postgres://configured-client';
	}
	return destination.url;
};

export const createVoiceMemoryObservabilityExportDeliveryReceiptStore =
	(): VoiceObservabilityExportDeliveryReceiptStore => {
		const receipts = new Map<string, VoiceObservabilityExportDeliveryReceipt>();

		return {
			get: (id) => receipts.get(id),
			list: () =>
				[...receipts.values()].sort(
					(left, right) => right.checkedAt - left.checkedAt
				),
			remove: (id) => {
				receipts.delete(id);
			},
			set: (id, receipt) => {
				receipts.set(id, receipt);
			}
		};
	};

export const createVoiceFileObservabilityExportDeliveryReceiptStore = (options: {
	directory: string;
}): VoiceObservabilityExportDeliveryReceiptStore => {
	const receiptPath = (id: string) =>
		join(options.directory, `${encodeURIComponent(id)}.json`);

	return {
		get: async (id) => {
			const file = Bun.file(receiptPath(id));
			if (!(await file.exists())) {
				return undefined;
			}
			return JSON.parse(
				await file.text()
			) as VoiceObservabilityExportDeliveryReceipt;
		},
		list: async () => {
			await mkdir(options.directory, { recursive: true });
			const receipts: VoiceObservabilityExportDeliveryReceipt[] = [];
			for (const entry of await Array.fromAsync(
				new Bun.Glob('*.json').scan(options.directory)
			)) {
				const file = Bun.file(join(options.directory, entry));
				receipts.push(
					JSON.parse(
						await file.text()
					) as VoiceObservabilityExportDeliveryReceipt
				);
			}
			return receipts.sort((left, right) => right.checkedAt - left.checkedAt);
		},
		remove: async (id) => {
			await unlink(receiptPath(id)).catch(() => undefined);
		},
		set: async (id, receipt) => {
			await mkdir(options.directory, { recursive: true });
			await Bun.write(receiptPath(id), `${JSON.stringify(receipt, null, 2)}\n`);
		}
	};
};

export const buildVoiceObservabilityExportDeliveryHistory = async (
	store: VoiceObservabilityExportDeliveryReceiptStore
): Promise<VoiceObservabilityExportDeliveryHistory> => {
	const receipts = await store.list();
	const failed = receipts.reduce(
		(count, receipt) => count + receipt.summary.failed,
		0
	);
	const delivered = receipts.reduce(
		(count, receipt) => count + receipt.summary.delivered,
		0
	);
	const totalDestinations = receipts.reduce(
		(count, receipt) => count + receipt.summary.total,
		0
	);

	return {
		checkedAt: Date.now(),
		receipts,
		status:
			failed > 0 || receipts.some((receipt) => receipt.status === 'fail')
				? 'fail'
				: receipts.some((receipt) => receipt.status === 'warn')
					? 'warn'
					: 'pass',
		summary: {
			delivered,
			failed,
			receipts: receipts.length,
			totalDestinations
		}
	};
};

const getSuccessfulObservabilityExportReceipts = (
	history: VoiceObservabilityExportDeliveryHistory
) =>
	history.receipts.filter(
		(receipt) =>
			receipt.status === 'pass' &&
			receipt.exportStatus === 'pass' &&
			receipt.summary.delivered > 0 &&
			receipt.summary.failed === 0
	);

const getLatestSuccessfulObservabilityExportReceipt = (
	history: VoiceObservabilityExportDeliveryHistory
) =>
	getSuccessfulObservabilityExportReceipts(history).sort(
		(left, right) => right.checkedAt - left.checkedAt
	)[0];

export const evaluateVoiceObservabilityExportDeliveryEvidence = (
	history: VoiceObservabilityExportDeliveryHistory,
	input: VoiceObservabilityExportDeliveryAssertionInput = {}
): VoiceObservabilityExportDeliveryAssertionReport => {
	const issues: string[] = [];
	const requiredStatus = input.requireStatus ?? 'pass';
	const maxFailed = input.maxFailed ?? 0;
	const maxFailedReceipts = input.maxFailedReceipts ?? 0;
	const maxFailedExportReceipts = input.maxFailedExportReceipts ?? 0;
	const minDelivered = input.minDelivered ?? 1;
	const minReceipts = input.minReceipts ?? 1;
	const minTotalDestinations = input.minTotalDestinations ?? 1;
	const now = input.now ?? Date.now();
	const failedReceipts = history.receipts.filter(
		(receipt) => receipt.status === 'fail'
	).length;
	const failedExportReceipts = history.receipts.filter(
		(receipt) => receipt.exportStatus === 'fail'
	).length;
	const latestSuccess = getLatestSuccessfulObservabilityExportReceipt(history);
	const latestSuccessAgeMs = latestSuccess
		? Math.max(0, now - latestSuccess.checkedAt)
		: undefined;
	const destinations = history.receipts.flatMap(
		(receipt) => receipt.destinations
	);
	const destinationIds = [
		...new Set(destinations.map((destination) => destination.destinationId))
	].sort();
	const destinationKinds = [
		...new Set(
			destinations.map((destination) => destination.destinationKind)
		)
	].sort();

	if (history.status !== requiredStatus) {
		issues.push(
			`Expected observability export delivery status ${requiredStatus}, found ${history.status}.`
		);
	}
	if (history.summary.failed > maxFailed) {
		issues.push(
			`Expected at most ${String(maxFailed)} failed observability export delivery destination(s), found ${String(history.summary.failed)}.`
		);
	}
	if (failedReceipts > maxFailedReceipts) {
		issues.push(
			`Expected at most ${String(maxFailedReceipts)} failed observability export delivery receipt(s), found ${String(failedReceipts)}.`
		);
	}
	if (failedExportReceipts > maxFailedExportReceipts) {
		issues.push(
			`Expected at most ${String(maxFailedExportReceipts)} failed observability export receipt manifest(s), found ${String(failedExportReceipts)}.`
		);
	}
	if (history.summary.delivered < minDelivered) {
		issues.push(
			`Expected at least ${String(minDelivered)} delivered observability export destination(s), found ${String(history.summary.delivered)}.`
		);
	}
	if (history.summary.receipts < minReceipts) {
		issues.push(
			`Expected at least ${String(minReceipts)} observability export delivery receipt(s), found ${String(history.summary.receipts)}.`
		);
	}
	if (history.summary.totalDestinations < minTotalDestinations) {
		issues.push(
			`Expected at least ${String(minTotalDestinations)} observability export destination(s), found ${String(history.summary.totalDestinations)}.`
		);
	}
	if (input.maxLatestSuccessAgeMs !== undefined) {
		if (latestSuccessAgeMs === undefined) {
			issues.push('Missing successful observability export delivery receipt.');
		} else if (latestSuccessAgeMs > input.maxLatestSuccessAgeMs) {
			issues.push(
				`Expected latest successful observability export delivery age at most ${String(input.maxLatestSuccessAgeMs)}ms, found ${String(latestSuccessAgeMs)}ms.`
			);
		}
	}
	for (const destinationId of input.requiredDestinationIds ?? []) {
		if (!destinationIds.includes(destinationId)) {
			issues.push(
				`Missing observability export delivery destination: ${destinationId}.`
			);
		}
	}
	for (const destinationKind of input.requiredDestinationKinds ?? []) {
		if (!destinationKinds.includes(destinationKind)) {
			issues.push(
				`Missing observability export delivery destination kind: ${destinationKind}.`
			);
		}
	}

	return {
		delivered: history.summary.delivered,
		destinationIds,
		destinationKinds,
		failed: history.summary.failed,
		failedExportReceipts,
		failedReceipts,
		issues,
		latestSuccessAgeMs,
		ok: issues.length === 0,
		receipts: history.summary.receipts,
		status: history.status,
		totalDestinations: history.summary.totalDestinations
	};
};

export const assertVoiceObservabilityExportDeliveryEvidence = (
	history: VoiceObservabilityExportDeliveryHistory,
	input: VoiceObservabilityExportDeliveryAssertionInput = {}
): VoiceObservabilityExportDeliveryAssertionReport => {
	const assertion = evaluateVoiceObservabilityExportDeliveryEvidence(
		history,
		input
	);
	if (!assertion.ok) {
		throw new Error(
			`Voice observability export delivery assertion failed: ${assertion.issues.join(' ')}`
		);
	}
	return assertion;
};

const inferContentType = (artifact: VoiceObservabilityExportArtifact) => {
	if (artifact.contentType) {
		return artifact.contentType;
	}
	const path = artifact.path ? stripArtifactPathAnchor(artifact.path) : '';
	if (path.endsWith('.json')) {
		return 'application/json; charset=utf-8';
	}
	if (path.endsWith('.md') || path.endsWith('.markdown')) {
		return 'text/markdown; charset=utf-8';
	}
	if (path.endsWith('.html')) {
		return 'text/html; charset=utf-8';
	}
	if (path.endsWith('.png')) {
		return 'image/png';
	}
	if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
		return 'image/jpeg';
	}
	if (path.endsWith('.txt') || path.endsWith('.log')) {
		return 'text/plain; charset=utf-8';
	}
	return 'application/octet-stream';
};

const addArtifactDownloadHrefs = (
	artifacts: VoiceObservabilityExportArtifact[],
	links?: VoiceObservabilityExportOptions['links']
) =>
	artifacts.map((artifact) => ({
		...artifact,
		contentType: artifact.contentType ?? inferContentType(artifact),
		downloadHref:
			artifact.downloadHref ??
			(artifact.path ? links?.artifactDownload?.(artifact) : undefined)
	}));

const verifyArtifact = async (
	artifact: VoiceObservabilityExportArtifact,
	options: NonNullable<VoiceObservabilityExportOptions['artifactIntegrity']>
): Promise<VoiceObservabilityExportArtifact> => {
	const now = options.now ?? Date.now();
	const maxAgeMs = artifact.maxAgeMs ?? options.maxAgeMs;

	if (!artifact.path) {
		return maxAgeMs === undefined
			? artifact
			: {
					...artifact,
					freshness: {
						checkedAt: now,
						generatedAt: artifact.generatedAt,
						maxAgeMs,
						status: artifact.status ?? 'pass'
					}
				};
	}

	const filePath = stripArtifactPathAnchor(artifact.path);
	try {
		const file = await stat(filePath);
		const generatedAt = artifact.generatedAt ?? file.mtimeMs;
		const generatedAtMs = toEpochMs(generatedAt);
		const ageMs = generatedAtMs === undefined ? undefined : now - generatedAtMs;
		const isStale =
			maxAgeMs !== undefined && ageMs !== undefined && ageMs > maxAgeMs;
		const checksum =
			options.checksum === 'sha256'
				? {
						algorithm: 'sha256' as const,
						value: await checksumFile(filePath)
					}
				: artifact.checksum;

		return {
			...artifact,
			bytes: artifact.bytes ?? file.size,
			checksum,
			freshness:
				maxAgeMs === undefined && generatedAt === undefined
					? artifact.freshness
					: {
							ageMs,
							checkedAt: now,
							generatedAt,
							maxAgeMs,
							status: isStale ? (options.staleSeverity ?? 'fail') : 'pass'
						},
			generatedAt,
			status:
				isStale && (options.staleSeverity ?? 'fail') === 'fail'
					? 'fail'
					: artifact.status
		};
	} catch {
		const severity = artifact.required
			? (options.missingSeverity ?? 'fail')
			: 'warn';
		return {
			...artifact,
			freshness: {
				checkedAt: now,
				generatedAt: artifact.generatedAt,
				maxAgeMs,
				status: severity
			},
			status: severity
		};
	}
};

const verifyArtifacts = (
	artifacts: VoiceObservabilityExportArtifact[],
	options?: VoiceObservabilityExportOptions['artifactIntegrity']
) => {
	const integrity = options ?? {};
	return Promise.all(
		artifacts.map((artifact) => verifyArtifact(artifact, integrity))
	);
};

const collectSessionIds = (input: {
	auditEvents: StoredVoiceAuditEvent[];
	callDebuggerReports: VoiceCallDebuggerReport[];
	events: StoredVoiceTraceEvent[];
	incidentBundles: VoiceIncidentBundle[];
	operationsRecords: VoiceOperationsRecord[];
	sessionIds?: string[];
	sessionSnapshots: VoiceSessionSnapshot[];
}) =>
	unique([
		...(input.sessionIds ?? []),
		...input.events.map((event) => event.sessionId),
		...input.auditEvents
			.map((event) => event.sessionId)
			.filter((sessionId): sessionId is string => Boolean(sessionId)),
		...input.operationsRecords.map((record) => record.sessionId),
		...input.incidentBundles.map((bundle) => bundle.sessionId),
		...input.sessionSnapshots.map((snapshot) => snapshot.sessionId),
		...input.callDebuggerReports.map((report) => report.sessionId)
	]);

const collectIssues = (input: {
	artifacts: VoiceObservabilityExportArtifact[];
	auditDeliveries?: VoiceAuditSinkDeliveryQueueSummary;
	operationsRecords: VoiceOperationsRecord[];
	traceDeliveries?: VoiceTraceSinkDeliveryQueueSummary;
	totalEvidence: number;
}): VoiceObservabilityExportIssue[] => {
	const issues: VoiceObservabilityExportIssue[] = [];
	const failedOperationsRecords = input.operationsRecords.filter(
		(record) => record.status === 'failed'
	).length;

	if (input.totalEvidence === 0) {
		issues.push({
			code: 'voice.observability.no_evidence',
			detail:
				'No traces, audits, operations records, or artifacts were included in the export manifest.',
			label: 'Observability evidence',
			severity: 'warn',
			value: 0
		});
	}
	if (failedOperationsRecords > 0) {
		issues.push({
			code: 'voice.observability.operation_failed',
			label: 'Failed operations records',
			severity: 'fail',
			value: failedOperationsRecords
		});
	}
	for (const artifact of input.artifacts) {
		if (
			artifact.required &&
			(artifact.status === 'fail' || artifact.status === 'warn')
		) {
			issues.push({
				code: 'voice.observability.artifact_failed',
				detail: `${artifact.label} reported ${artifact.status}.`,
				label: 'Artifact status',
				severity: artifact.status,
				value: artifact.id
			});
		}
		if (
			artifact.path &&
			artifact.status !== 'pass' &&
			artifact.required &&
			artifact.bytes === undefined &&
			artifact.freshness?.ageMs === undefined
		) {
			issues.push({
				code: 'voice.observability.artifact_missing',
				detail: `${artifact.label} was required but could not be verified at ${artifact.path}.`,
				label: 'Required artifact',
				severity: artifact.status === 'fail' ? 'fail' : 'warn',
				value: artifact.id
			});
			continue;
		}
		if (
			artifact.freshness?.maxAgeMs !== undefined &&
			artifact.freshness.ageMs !== undefined &&
			artifact.freshness.ageMs > artifact.freshness.maxAgeMs
		) {
			issues.push({
				code: 'voice.observability.artifact_stale',
				detail: `${artifact.label} is older than the configured freshness window.`,
				label: 'Stale artifact',
				severity: artifact.freshness.status === 'fail' ? 'fail' : 'warn',
				value: artifact.id
			});
		}
	}
	if ((input.auditDeliveries?.failed ?? 0) > 0) {
		issues.push({
			code: 'voice.observability.audit_delivery_failed',
			label: 'Failed audit exports',
			severity: 'fail',
			value: input.auditDeliveries?.failed
		});
	}
	if ((input.auditDeliveries?.pending ?? 0) > 0) {
		issues.push({
			code: 'voice.observability.audit_delivery_pending',
			label: 'Pending audit exports',
			severity: 'warn',
			value: input.auditDeliveries?.pending
		});
	}
	if ((input.traceDeliveries?.failed ?? 0) > 0) {
		issues.push({
			code: 'voice.observability.trace_delivery_failed',
			label: 'Failed trace exports',
			severity: 'fail',
			value: input.traceDeliveries?.failed
		});
	}
	if ((input.traceDeliveries?.pending ?? 0) > 0) {
		issues.push({
			code: 'voice.observability.trace_delivery_pending',
			label: 'Pending trace exports',
			severity: 'warn',
			value: input.traceDeliveries?.pending
		});
	}

	return issues;
};

const buildTraceEnvelope = (
	event: StoredVoiceTraceEvent,
	operationsRecordHref?: string
): VoiceObservabilityExportEnvelope => ({
	at: event.at,
	eventId: event.id,
	eventType: event.type,
	kind: 'trace',
	operationsRecordHref,
	provider: getString(event.payload.provider),
	providerKind: getProviderKind(event.payload),
	scenarioId: event.scenarioId,
	sessionId: event.sessionId,
	severity: toSeverityFromTrace(event),
	traceId: event.traceId
});

const buildAuditEnvelope = (
	event: StoredVoiceAuditEvent,
	operationsRecordHref?: string
): VoiceObservabilityExportEnvelope => ({
	at: event.at,
	eventId: event.id,
	eventType: event.type,
	kind: 'audit',
	operationsRecordHref,
	provider: getString(event.payload?.provider),
	providerKind: getProviderKind(event.payload ?? {}),
	sessionId: event.sessionId,
	severity: toSeverityFromAudit(event),
	traceId: event.traceId
});

const resolveObservabilityExportList = async <T>(
	value: T[] | (() => T[] | Promise<T[]>) | undefined
) => (typeof value === 'function' ? await value() : (value ?? []));

export const buildVoiceObservabilityExport = async (
	options: VoiceObservabilityExportOptions = {}
): Promise<VoiceObservabilityExportReport> => {
	const time = async <Result>(
		label: string,
		run: () => Promise<Result> | Result
	): Promise<Result> => {
		const startedAt = Date.now();
		try {
			return await run();
		} finally {
			const endedAt = Date.now();
			options.onTiming?.({
				durationMs: Math.max(0, endedAt - startedAt),
				endedAt,
				label,
				startedAt
			});
		}
	};
	const events = await time(
		'events',
		async () => options.events ?? (await options.store?.list()) ?? []
	);
	const auditEvents = await time('auditEvents', async () =>
		options.audit ? await options.audit.list() : []
	);
	const baseOperationsRecords = options.operationsRecords ?? [];
	const [
		sessionSnapshots,
		callDebuggerReports,
		incidentBundles,
		incidentRecoveryOutcomeReports
	] = await time(
		'supportArtifacts',
		() =>
			Promise.all([
				resolveObservabilityExportList(options.sessionSnapshots),
				resolveObservabilityExportList(options.callDebuggerReports),
				resolveObservabilityExportList(options.incidentBundles),
				resolveObservabilityExportList(options.incidentRecoveryOutcomeReports)
			])
	);
	const sessionIds = await time('sessionIds', () => collectSessionIds({
		auditEvents,
		callDebuggerReports,
		events,
		incidentBundles,
		operationsRecords: baseOperationsRecords,
		sessionIds: options.sessionIds,
		sessionSnapshots
	}));
	const shouldBuildOperationsRecords =
		options.includeOperationsRecords === true && options.store;
	const builtOperationsRecords = await time('operationsRecords', () =>
		shouldBuildOperationsRecords
			? Promise.all(
					sessionIds.map((sessionId) =>
						buildVoiceOperationsRecord({
							audit: options.audit,
							redact: options.redact,
							sessionId,
							store: options.store
						} satisfies VoiceOperationsRecordOptions)
					)
				)
			: []
	);
	const operationsRecords = [
		...baseOperationsRecords,
		...builtOperationsRecords.filter(
			(record) =>
				!baseOperationsRecords.some(
					(existing) => existing.sessionId === record.sessionId
				)
			)
	];
	const [traceDeliveries, auditDeliveries] = await time('deliveries', () =>
		Promise.all([
			options.traceDeliveries
				? isDeliveryStore(options.traceDeliveries)
					? options.traceDeliveries.list()
					: options.traceDeliveries
				: undefined,
			options.auditDeliveries
				? isDeliveryStore(options.auditDeliveries)
					? options.auditDeliveries.list()
					: options.auditDeliveries
				: undefined
		])
	);
	const [traceDeliverySummary, auditDeliverySummary] = await time(
		'deliverySummaries',
		() =>
			Promise.all([
				traceDeliveries
					? summarizeVoiceTraceSinkDeliveries(traceDeliveries)
					: undefined,
				auditDeliveries
					? summarizeVoiceAuditSinkDeliveries(auditDeliveries)
					: undefined
			])
	);
	const operationArtifacts = await time('operationArtifacts', () => operationsRecords.map((record) =>
		createOperationArtifact(
			record,
			options.links?.operationsRecord?.(record.sessionId)
		)
	));
	const sessionSnapshotArtifacts = await time('sessionSnapshotArtifacts', () => sessionSnapshots.map((snapshot) =>
		createSessionSnapshotArtifact(
			snapshot,
			options.links?.sessionSnapshot?.(snapshot.sessionId)
		)
	));
	const callDebuggerArtifacts = await time('callDebuggerArtifacts', () => callDebuggerReports.map((report) =>
		createCallDebuggerArtifact(
			report,
			options.links?.callDebugger?.(report.sessionId)
		)
	));
	const incidentBundleArtifacts = await time('incidentBundleArtifacts', () =>
		incidentBundles.map(createIncidentBundleArtifact)
	);
	const incidentRecoveryOutcomeArtifacts = await time(
		'incidentRecoveryOutcomeArtifacts',
		() => incidentRecoveryOutcomeReports.map(createIncidentRecoveryOutcomeArtifact)
	);
	const artifacts = await time('artifacts', async () =>
		addArtifactDownloadHrefs(
			await verifyArtifacts(
				[
					...operationArtifacts,
					...sessionSnapshotArtifacts,
					...callDebuggerArtifacts,
					...incidentBundleArtifacts,
					...incidentRecoveryOutcomeArtifacts,
					...(options.artifacts ?? [])
				],
				options.artifactIntegrity
			),
			options.links
		),
	);
	const operationHrefBySessionId = new Map(
		sessionIds.map((sessionId) => [
			sessionId,
			options.links?.operationsRecord?.(sessionId)
		])
	);
	const envelopes = await time('envelopes', () => [
		...events.map((event) =>
			buildTraceEnvelope(event, operationHrefBySessionId.get(event.sessionId))
		),
		...auditEvents.map((event) =>
			buildAuditEnvelope(
				event,
				event.sessionId
					? operationHrefBySessionId.get(event.sessionId)
					: undefined
				)
		)
	].sort((left, right) => left.at - right.at));
	const issues = await time('issues', () => collectIssues({
		artifacts,
		auditDeliveries: auditDeliverySummary,
		operationsRecords,
		totalEvidence:
			events.length + auditEvents.length + operationsRecords.length + artifacts.length,
		traceDeliveries: traceDeliverySummary
	}));
	const status = issues.some((issue) => issue.severity === 'fail')
		? 'fail'
		: issues.some((issue) => issue.severity === 'warn')
			? 'warn'
			: 'pass';

	return {
		artifacts,
		checkedAt: Date.now(),
		deliveries: {
			audit: auditDeliverySummary,
			trace: traceDeliverySummary
		},
		envelopes,
		issues,
		operationsRecords,
		redaction: {
			enabled: Boolean(options.redact),
			mode: options.redact ? 'redacted' : 'none'
		},
		schema: createVoiceObservabilityExportSchema(),
		sessionIds,
		status,
		summary: {
			auditEvents: auditEvents.length,
			events: events.length + auditEvents.length,
			failedOperationsRecords: operationsRecords.filter(
				(record) => record.status === 'failed'
			).length,
			trace: summarizeVoiceTrace(events),
			traceEvents: events.length
		}
	};
};

export const renderVoiceObservabilityExportMarkdown = (
	report: VoiceObservabilityExportReport,
	options: {
		title?: string;
	} = {}
) => {
	const title = options.title ?? 'Voice Observability Export';
	const issues =
		report.issues
			.map(
				(issue) =>
					`- ${issue.severity}: ${issue.label}${issue.value !== undefined ? ` (${issue.value})` : ''}${issue.detail ? ` - ${issue.detail}` : ''}`
			)
			.join('\n') || 'No observability export issues.';
	const artifacts =
		report.artifacts
			.map(
				(artifact) =>
					`- ${artifact.label}: ${artifact.kind}${artifact.href ? ` (${artifact.href})` : ''}${artifact.status ? ` - ${artifact.status}` : ''}${artifact.bytes !== undefined ? `, ${artifact.bytes} bytes` : ''}${artifact.checksum ? `, sha256 ${artifact.checksum.value}` : ''}${artifact.freshness?.ageMs !== undefined ? `, age ${Math.round(artifact.freshness.ageMs)}ms` : ''}`
			)
			.join('\n') || 'No artifacts attached.';

	return `# ${title}

Generated: ${new Date(report.checkedAt).toISOString()}

Overall: **${report.status}**

Redaction: **${report.redaction.mode}**

Sessions: ${report.sessionIds.length}

Trace events: ${report.summary.traceEvents}

Audit events: ${report.summary.auditEvents}

Operations records: ${report.operationsRecords.length}

Artifacts: ${report.artifacts.length}

## Delivery Summary

Trace deliveries: ${report.deliveries.trace ? `${report.deliveries.trace.delivered} delivered, ${report.deliveries.trace.pending} pending, ${report.deliveries.trace.failed} failed` : 'not configured'}

Audit deliveries: ${report.deliveries.audit ? `${report.deliveries.audit.delivered} delivered, ${report.deliveries.audit.pending} pending, ${report.deliveries.audit.failed} failed` : 'not configured'}

## Artifacts

${artifacts}

## Issues

${issues}
`;
};

export const buildVoiceObservabilityArtifactIndex = (
	report: VoiceObservabilityExportReport
): VoiceObservabilityExportArtifactIndex => {
	const artifacts = report.artifacts.map((artifact) => ({
		bytes: artifact.bytes,
		checksum: artifact.checksum,
		contentType: artifact.contentType,
		downloadHref: artifact.downloadHref,
		freshness: artifact.freshness,
		href: artifact.href,
		id: artifact.id,
		kind: artifact.kind,
		label: artifact.label,
		metadata: artifact.metadata,
		required: artifact.required,
		sessionId: artifact.sessionId,
		status: artifact.status
	}));

	return {
		artifacts,
		checkedAt: report.checkedAt,
		schema: report.schema,
		status: report.status,
		summary: {
			downloadable: artifacts.filter((artifact) => artifact.downloadHref).length,
			failed: artifacts.filter((artifact) => artifact.status === 'fail').length,
			required: artifacts.filter((artifact) => artifact.required).length,
			total: artifacts.length,
			warn: artifacts.filter((artifact) => artifact.status === 'warn').length
		}
	};
};

export const deliverVoiceObservabilityExport = async (
	options: VoiceObservabilityExportDeliveryOptions
): Promise<VoiceObservabilityExportDeliveryReport> => {
	const checkedAt = Date.now();
	const runId =
		options.runId ?? new Date(checkedAt).toISOString().replaceAll(':', '-');
	const artifactIndex = buildVoiceObservabilityArtifactIndex(options.report);
	const manifest = `${JSON.stringify(options.report, null, 2)}\n`;
	const index = `${JSON.stringify(artifactIndex, null, 2)}\n`;

	const destinations = await Promise.all(
		options.destinations.map(async (destination) => {
			const destinationId =
				destination.id ?? `${destination.kind}-${destination.label ?? 'export'}`;
			const label =
				destination.label ??
				(destination.kind === 'file'
					? 'File observability export'
					: destination.kind === 's3'
						? 'S3 observability export'
						: destination.kind === 'sqlite'
							? 'SQLite observability export'
							: destination.kind === 'postgres'
								? 'Postgres observability export'
								: 'Webhook observability export');
			try {
				if (destination.kind === 'file') {
					const target = join(destination.directory, runId);
					await mkdir(join(target, 'artifacts'), { recursive: true });
					await Bun.write(join(target, 'manifest.json'), manifest);
					await Bun.write(join(target, 'artifact-index.json'), index);

					if (destination.includeArtifacts !== false) {
						for (const artifact of options.report.artifacts) {
							if (!artifact.path) {
								continue;
							}
							await Bun.write(
								join(target, 'artifacts', safeArtifactFileName(artifact)),
								await readFile(stripArtifactPathAnchor(artifact.path))
							);
						}
					}

					return {
						artifactCount:
							destination.includeArtifacts === false
								? 0
								: options.report.artifacts.filter((artifact) => artifact.path)
										.length,
						deliveredAt: Date.now(),
						destinationId,
						destinationKind: destination.kind,
						label,
						manifestBytes: byteLength(manifest),
						schema: options.report.schema,
						status: 'delivered' as const,
						target
					};
				}

				if (destination.kind === 's3') {
					const keyPrefix = normalizeExportS3KeyPrefix(destination.keyPrefix);
					const rootKey = joinS3Key(keyPrefix, runId);
					const client = destination.client ?? new Bun.S3Client(destination);
					const s3Options = destination as S3Options;
					await writeS3Object({
						client,
						contentType: 'application/json',
						key: joinS3Key(rootKey, 'manifest.json'),
						options: s3Options,
						value: manifest
					});
					await writeS3Object({
						client,
						contentType: 'application/json',
						key: joinS3Key(rootKey, 'artifact-index.json'),
						options: s3Options,
						value: index
					});

					if (destination.includeArtifacts !== false) {
						for (const artifact of options.report.artifacts) {
							if (!artifact.path) {
								continue;
							}
							await writeS3Object({
								client,
								contentType:
									artifact.contentType ?? inferContentType(artifact),
								key: joinS3Key(
									rootKey,
									'artifacts',
									safeArtifactFileName(artifact)
								),
								options: s3Options,
								value: await readFile(stripArtifactPathAnchor(artifact.path))
							});
						}
					}

					return {
						artifactCount:
							destination.includeArtifacts === false
								? 0
								: options.report.artifacts.filter((artifact) => artifact.path)
										.length,
						deliveredAt: Date.now(),
						destinationId,
						destinationKind: destination.kind,
						label,
						manifestBytes: byteLength(manifest),
						schema: options.report.schema,
						status: 'delivered' as const,
						target: destination.bucket
							? `s3://${destination.bucket}/${rootKey}`
							: rootKey
					};
				}

				if (destination.kind === 'sqlite') {
					const target = await deliverObservabilityExportToSQLite({
						artifactIndex,
						checkedAt,
						destination,
						index,
						manifest,
						report: options.report,
						runId
					});

					return {
						artifactCount: artifactIndex.summary.total,
						deliveredAt: Date.now(),
						destinationId,
						destinationKind: destination.kind,
						label,
						manifestBytes: byteLength(manifest),
						schema: options.report.schema,
						status: 'delivered' as const,
						target
					};
				}

				if (destination.kind === 'postgres') {
					const target = await deliverObservabilityExportToPostgres({
						artifactIndex,
						checkedAt,
						destination,
						index,
						manifest,
						report: options.report,
						runId
					});

					return {
						artifactCount: artifactIndex.summary.total,
						deliveredAt: Date.now(),
						destinationId,
						destinationKind: destination.kind,
						label,
						manifestBytes: byteLength(manifest),
						schema: options.report.schema,
						status: 'delivered' as const,
						target
					};
				}

				const controller = new AbortController();
				const timeout = setTimeout(
					() => controller.abort(),
					destination.timeoutMs ?? 10_000
				);
				try {
					const response = await (destination.fetch ?? fetch)(destination.url, {
						body: JSON.stringify({
							artifactIndex,
							artifacts: destination.includeArtifacts === false
								? []
								: options.report.artifacts,
							manifest: options.report,
							runId,
							source: 'absolutejs-voice'
						}),
						headers: {
							'content-type': 'application/json',
							...(destination.headers ?? {})
						},
						method: 'POST',
						signal: controller.signal
					});

					if (!response.ok) {
						throw new Error(`Webhook returned HTTP ${response.status}`);
					}
				} finally {
					clearTimeout(timeout);
				}

				return {
					artifactCount:
						destination.includeArtifacts === false
							? 0
							: options.report.artifacts.length,
					deliveredAt: Date.now(),
					destinationId,
					destinationKind: destination.kind,
					label,
					manifestBytes: byteLength(manifest),
					schema: options.report.schema,
					status: 'delivered' as const,
					target: destination.url
				};
			} catch (error) {
				return {
					artifactCount: 0,
					deliveredAt: Date.now(),
					destinationId,
					destinationKind: destination.kind,
					error: error instanceof Error ? error.message : String(error),
					label,
					manifestBytes: byteLength(manifest),
					schema: options.report.schema,
					status: 'failed' as const,
					target: observabilityExportDeliveryFailureTarget(destination)
				};
			}
		})
	);
	const failed = destinations.filter(
		(destination) => destination.status === 'failed'
	).length;
	const status: VoiceObservabilityExportStatus =
		failed > 0 || options.report.status === 'fail'
			? 'fail'
			: options.report.status === 'warn'
				? 'warn'
				: 'pass';

	const report: VoiceObservabilityExportDeliveryReport = {
		checkedAt,
		destinations,
		exportStatus: options.report.status,
		status,
		summary: {
			delivered: destinations.length - failed,
			failed,
			total: destinations.length
		}
	};
	if (options.receipts) {
		const receipt = {
			...report,
			id: deliveryReceiptId(runId),
			runId
		} satisfies VoiceObservabilityExportDeliveryReceipt;
		await options.receipts.set(receipt.id, receipt);
	}

	return report;
};

export const createVoiceObservabilityExportRoutes = (
	options: VoiceObservabilityExportRoutesOptions = {}
) => {
	const path = options.path ?? '/api/voice/observability-export';
	const artifactIndexPath =
		options.artifactIndexPath ?? `${path}/artifacts`;
	const artifactDownloadPath =
		options.artifactDownloadPath ?? `${path}/artifacts`;
	const deliveryPath = options.deliveryPath ?? `${path}/deliveries`;
	const markdownPath =
		options.markdownPath ?? '/voice/observability-export.md';
	const htmlPath = options.htmlPath ?? '/voice/observability-export';
	const headers = {
		'cache-control': 'no-store',
		...(options.headers ?? {})
	};
	const buildReport = () =>
		buildVoiceObservabilityExport({
			...options,
			links: {
				...options.links,
				artifactDownload:
					options.links?.artifactDownload ??
					(artifactDownloadPath
						? (artifact) =>
								`${artifactDownloadPath}/${encodeURIComponent(artifact.id)}`
						: undefined)
			}
		});
	const app = new Elysia({
		name: options.name ?? 'absolute-voice-observability-export'
	});

	app.get(path, async () => Response.json(await buildReport(), { headers }));

	if (artifactIndexPath !== false) {
		app.get(artifactIndexPath, async () =>
			Response.json(
				options.artifactIndex
					? await resolveVoiceObservabilityArtifactIndex(options.artifactIndex)
					: buildVoiceObservabilityArtifactIndex(await buildReport()),
				{ headers }
			)
		);
	}

	if (artifactDownloadPath !== false) {
		app.get(`${artifactDownloadPath}/:artifactId`, async ({ params }) => {
			const artifactId = decodeURIComponent(params.artifactId);
			const report = await buildReport();
			const artifact = report.artifacts.find((item) => item.id === artifactId);

			if (!artifact?.path) {
				return Response.json(
					{ error: 'Artifact is not downloadable.', artifactId },
					{ headers, status: 404 }
				);
			}

			try {
				const body = await readFile(stripArtifactPathAnchor(artifact.path));
				return new Response(body, {
					headers: {
						...headers,
						'content-disposition': `attachment; filename="${encodeURIComponent(artifact.id)}"`,
						'content-type': artifact.contentType ?? inferContentType(artifact),
						...(artifact.checksum
							? {
									'x-absolute-voice-artifact-sha256':
										artifact.checksum.value
								}
							: {}),
						'x-absolute-voice-artifact-id': artifact.id,
						...(artifact.freshness
							? {
									'x-absolute-voice-artifact-freshness':
										artifact.freshness.status
								}
							: {})
					}
				});
			} catch {
				return Response.json(
					{ error: 'Artifact file is not available.', artifactId },
					{ headers, status: 404 }
				);
			}
		});
	}

	if (deliveryPath !== false && options.deliveryDestinations) {
		if (options.deliveryReceipts) {
			app.get(deliveryPath, async () =>
				Response.json(
					await buildVoiceObservabilityExportDeliveryHistory(
						options.deliveryReceipts as VoiceObservabilityExportDeliveryReceiptStore
					),
					{ headers }
				)
			);
		}
		app.post(deliveryPath, async () =>
			Response.json(
				await deliverVoiceObservabilityExport({
					destinations: options.deliveryDestinations ?? [],
					receipts: options.deliveryReceipts,
					report: await buildReport()
				}),
				{ headers }
			)
		);
	}

	if (markdownPath !== false) {
		app.get(markdownPath, async () => {
			const report = await buildReport();
			return new Response(
				renderVoiceObservabilityExportMarkdown(report, {
					title: options.title
				}),
				{
					headers: {
						...headers,
						'content-type': 'text/markdown; charset=utf-8'
					}
				}
			);
		});
	}

	if (htmlPath !== false) {
		app.get(htmlPath, async () => {
			const report = await buildReport();
			const markdown = options.render
				? await options.render(report)
				: renderVoiceObservabilityExportMarkdown(report, {
						title: options.title
					});
			return new Response(
				`<!doctype html><html><head><meta charset="utf-8" /><title>${options.title ?? 'Voice Observability Export'}</title><style>body{font-family:ui-sans-serif,system-ui,sans-serif;margin:auto;max-width:920px;padding:32px;white-space:pre-wrap}</style></head><body>${markdown}</body></html>`,
				{
					headers: {
						...headers,
						'content-type': 'text/html; charset=utf-8'
					}
				}
			);
		});
	}

	return app;
};
