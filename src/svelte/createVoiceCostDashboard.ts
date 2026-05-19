import {
  buildVoiceCostDashboardReport,
  type VoiceCostDashboardOptions,
  type VoiceCostDashboardReport,
} from "../client/costDashboard";

export type CreateVoiceCostDashboardOptions = VoiceCostDashboardOptions & {
  currency?: string;
  title?: string;
};

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatUsd = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    currency,
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);

const formatInteger = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

export const renderVoiceCostDashboardHTML = (
  report: VoiceCostDashboardReport,
  options: { currency?: string; title?: string } = {},
): string => {
  const currency = options.currency ?? "USD";
  const title = options.title ?? "Voice cost dashboard";
  const rowFor = (
    bucketKey: string,
    callCount: number,
    llmUsd: number,
    ttsUsd: number,
    sttUsd: number,
    telephonyUsd: number,
    totalUsd: number,
    isTotal: boolean,
  ) =>
    `<tr data-bucket-key="${escape(bucketKey)}" style="${isTotal ? "border-top:2px solid rgba(255,255,255,0.15);font-weight:600;" : ""}">
      <td style="padding:8px 12px;">${escape(bucketKey)}</td>
      <td style="padding:8px 12px;text-align:right;">${formatInteger(callCount)}</td>
      <td style="padding:8px 12px;text-align:right;">${formatUsd(llmUsd, currency)}</td>
      <td style="padding:8px 12px;text-align:right;">${formatUsd(ttsUsd, currency)}</td>
      <td style="padding:8px 12px;text-align:right;">${formatUsd(sttUsd, currency)}</td>
      <td style="padding:8px 12px;text-align:right;">${formatUsd(telephonyUsd, currency)}</td>
      <td style="padding:8px 12px;text-align:right;">${formatUsd(totalUsd, currency)}</td>
    </tr>`;
  const bodyRows = report.buckets
    .map((bucket) =>
      rowFor(
        bucket.bucketKey,
        bucket.callCount,
        bucket.llmUsd,
        bucket.ttsUsd,
        bucket.sttUsd,
        bucket.telephonyUsd,
        bucket.totalUsd,
        false,
      ),
    )
    .join("");
  const totalRow = rowFor(
    "total",
    report.grandTotal.callCount,
    report.grandTotal.llmUsd,
    report.grandTotal.ttsUsd,
    report.grandTotal.sttUsd,
    report.grandTotal.telephonyUsd,
    report.grandTotal.totalUsd,
    true,
  );
  return `<section aria-label="voice-cost-dashboard" class="absolute-voice-cost-dashboard" style="background:#0f172a;border-radius:16px;color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif;padding:20px;">
  <header style="align-items:baseline;display:flex;gap:12px;margin-bottom:12px;">
    <strong style="font-size:16px;">${escape(title)}</strong>
    <span style="font-size:13px;opacity:0.7;">${report.buckets.length} buckets · grand total ${formatUsd(report.grandTotal.totalUsd, currency)}</span>
  </header>
  <table style="border-collapse:collapse;font-size:13px;width:100%;">
    <thead><tr style="opacity:0.7;text-align:left;">
      <th style="padding:8px 12px;">Bucket</th>
      <th style="padding:8px 12px;text-align:right;">Calls</th>
      <th style="padding:8px 12px;text-align:right;">LLM</th>
      <th style="padding:8px 12px;text-align:right;">TTS</th>
      <th style="padding:8px 12px;text-align:right;">STT</th>
      <th style="padding:8px 12px;text-align:right;">Tel.</th>
      <th style="padding:8px 12px;text-align:right;">Total</th>
    </tr></thead>
    <tbody>${bodyRows}${totalRow}</tbody>
  </table>
</section>`;
};

export const createVoiceCostDashboard = (
  options: CreateVoiceCostDashboardOptions,
) => {
  const buildReport = () => buildVoiceCostDashboardReport(options);
  return {
    getHTML: () =>
      renderVoiceCostDashboardHTML(buildReport(), {
        currency: options.currency,
        title: options.title,
      }),
    getReport: buildReport,
  };
};
