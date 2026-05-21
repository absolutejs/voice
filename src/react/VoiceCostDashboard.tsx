import type { ReactNode } from "react";
import {
  buildVoiceCostDashboardReport,
  type VoiceCostDashboardBucket,
  type VoiceCostDashboardOptions,
} from "../client/costDashboard";

export type VoiceCostDashboardProps = Omit<
  VoiceCostDashboardOptions,
  "bucketBy"
> & {
  bucketBy?: VoiceCostDashboardOptions["bucketBy"];
  className?: string;
  currency?: string;
  emptyMessage?: ReactNode;
  title?: string;
};

const formatUsd = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    currency,
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);

const formatInteger = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

const renderRow = (
  bucket: VoiceCostDashboardBucket,
  currency: string,
  isTotal: boolean,
) => (
  <tr
    data-bucket-key={bucket.bucketKey}
    key={bucket.bucketKey}
    style={{
      borderTop: isTotal ? "2px solid rgba(255,255,255,0.15)" : undefined,
      fontWeight: isTotal ? 600 : undefined,
    }}
  >
    <td style={{ padding: "8px 12px" }}>{bucket.bucketKey}</td>
    <td style={{ padding: "8px 12px", textAlign: "right" }}>
      {formatInteger(bucket.callCount)}
    </td>
    <td style={{ padding: "8px 12px", textAlign: "right" }}>
      {formatUsd(bucket.llmUsd, currency)}
    </td>
    <td style={{ padding: "8px 12px", textAlign: "right" }}>
      {formatUsd(bucket.ttsUsd, currency)}
    </td>
    <td style={{ padding: "8px 12px", textAlign: "right" }}>
      {formatUsd(bucket.sttUsd, currency)}
    </td>
    <td style={{ padding: "8px 12px", textAlign: "right" }}>
      {formatUsd(bucket.telephonyUsd, currency)}
    </td>
    <td style={{ padding: "8px 12px", textAlign: "right" }}>
      {formatUsd(bucket.totalUsd, currency)}
    </td>
  </tr>
);

export const VoiceCostDashboard = ({
  className,
  currency = "USD",
  emptyMessage = "No cost events in window.",
  title = "Voice cost dashboard",
  ...options
}: VoiceCostDashboardProps) => {
  const report = buildVoiceCostDashboardReport(options);

  return (
    <section
      aria-label="voice-cost-dashboard"
      className={className ?? "absolute-voice-cost-dashboard"}
      style={{
        background: "#0f172a",
        borderRadius: 16,
        color: "#f8fafc",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        padding: 20,
      }}
    >
      <header
        style={{
          alignItems: "baseline",
          display: "flex",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <strong style={{ fontSize: 16 }}>{title}</strong>
        <span style={{ fontSize: 13, opacity: 0.7 }}>
          {report.buckets.length} buckets · grand total{" "}
          {formatUsd(report.grandTotal.totalUsd, currency)}
        </span>
      </header>
      {report.buckets.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.7 }}>{emptyMessage}</p>
      ) : (
        <table
          style={{
            borderCollapse: "collapse",
            fontSize: 13,
            width: "100%",
          }}
        >
          <thead>
            <tr style={{ opacity: 0.7, textAlign: "left" }}>
              <th style={{ padding: "8px 12px" }}>Bucket</th>
              <th style={{ padding: "8px 12px", textAlign: "right" }}>Calls</th>
              <th style={{ padding: "8px 12px", textAlign: "right" }}>LLM</th>
              <th style={{ padding: "8px 12px", textAlign: "right" }}>TTS</th>
              <th style={{ padding: "8px 12px", textAlign: "right" }}>STT</th>
              <th style={{ padding: "8px 12px", textAlign: "right" }}>Tel.</th>
              <th style={{ padding: "8px 12px", textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {report.buckets.map((bucket) => renderRow(bucket, currency, false))}
            {renderRow(report.grandTotal, currency, true)}
          </tbody>
        </table>
      )}
    </section>
  );
};
