import type { ModelSelection, ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import {
  CLAUDE_RESUME_COMPACTION_NEVER_ANSWER,
  isClaudeResumeCompactionQuestion,
} from "@t3tools/shared/claudeCompaction";
import {
  resolveSelectableProviderInstanceEntry,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { getTriggerDisplayModelName, type ModelEsque } from "./providerIconUtils";

// Used when the provider did not report its cache TTL: Claude's 1h cache plus slack.
const CLAUDE_RESUME_COMPACTION_FALLBACK_MS = 70 * 60_000;
const CLAUDE_RESUME_COMPACTION_TOKENS = 100_000;

export function providerSupportsManualCompaction(
  provider: ProviderInstanceEntry | null | undefined,
): boolean {
  return provider?.snapshot.slashCommands.some((command) => command.name === "compact") ?? false;
}

export function hasAvailableCompactionProvider(input: {
  readonly providers: ReadonlyArray<ProviderInstanceEntry>;
  readonly driverKind: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId | null;
  readonly lockedInstanceId: ProviderInstanceId | null;
}): boolean {
  const driverProviders = input.providers.filter(
    (provider) => provider.driverKind === input.driverKind,
  );
  const lockedContinuationGroupKey = input.lockedInstanceId
    ? driverProviders.find((provider) => provider.instanceId === input.lockedInstanceId)
        ?.continuationGroupKey
    : undefined;
  const compatibleProviders = lockedContinuationGroupKey
    ? driverProviders.filter(
        (provider) => provider.continuationGroupKey === lockedContinuationGroupKey,
      )
    : driverProviders;

  return providerSupportsManualCompaction(
    resolveSelectableProviderInstanceEntry(compatibleProviders, input.instanceId ?? undefined),
  );
}

export function hasDismissedResumeCompaction(
  activities: ReadonlyArray<{ readonly kind: string; readonly payload: unknown }>,
): boolean {
  return activities.some((activity) => {
    if (activity.kind !== "user-input.resolved") return false;
    const payload = activity.payload;
    if (!payload || typeof payload !== "object") return false;
    const answers = (payload as { readonly answers?: unknown }).answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;

    return Object.entries(answers).some(
      ([question, answer]) =>
        isClaudeResumeCompactionQuestion(question) &&
        answer === CLAUDE_RESUME_COMPACTION_NEVER_ANSWER,
    );
  });
}

/** True once a large Claude context's prompt cache has expired, so the next
    turn would re-read all of it uncached. */
export function shouldOfferResumeCompaction(input: {
  readonly provider: string | null | undefined;
  readonly usedTokens: number | null | undefined;
  readonly updatedAt: string | null | undefined;
  readonly promptCacheTtlMs?: number | undefined;
  readonly now: string;
}): boolean {
  if (
    input.provider !== "claudeAgent" ||
    (input.usedTokens ?? 0) < CLAUDE_RESUME_COMPACTION_TOKENS
  ) {
    return false;
  }

  const updatedAt = Date.parse(input.updatedAt ?? "");
  const now = Date.parse(input.now);
  return (
    Number.isFinite(updatedAt) &&
    Number.isFinite(now) &&
    now - updatedAt >= (input.promptCacheTtlMs ?? CLAUDE_RESUME_COMPACTION_FALLBACK_MS)
  );
}

export function resolveContextWindowModelDisplayName(
  selection: ModelSelection | null | undefined,
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>,
): string | null {
  if (!selection) {
    return null;
  }

  const selectedModel = modelOptionsByInstance
    .get(selection.instanceId)
    ?.find((model) => model.slug === selection.model);

  return selectedModel ? getTriggerDisplayModelName(selectedModel) : selection.model;
}

export function formatContextWindowCompactionMessage(
  modelDisplayName: string | null | undefined,
  autoCompactThreshold?: number | null,
): string {
  if (typeof autoCompactThreshold === "number" && autoCompactThreshold > 0) {
    return `Compacts automatically at ${autoCompactThreshold.toLocaleString("en-US")} tokens.`;
  }
  return modelDisplayName
    ? `Context for ${modelDisplayName} compacts automatically when needed.`
    : "Context compacts automatically when needed.";
}

/**
 * Whether the footer should hold the meter's slot before a snapshot exists.
 *
 * The snapshot comes from thread activities, which load after the shell.
 * Reserving the slot while the detail loads, for a started thread, keeps the
 * attach button still until the meter mounts. Once the detail is in, a
 * missing snapshot means there is no usage to show and nothing is reserved.
 *
 * The meter renders from stored activities whatever the provider's state, so
 * only a provider known not to stream usage skips the reservation. An unknown
 * provider (catalog still loading, or the thread's provider disabled) reserves.
 */
export function shouldReserveContextWindowMeter(input: {
  readonly meterEnabled: boolean;
  readonly detailLoading: boolean;
  readonly threadStarted: boolean;
  /** `null` while the thread's provider is not in the catalog. */
  readonly providerReportsContextWindow: boolean | null;
}): boolean {
  return (
    input.meterEnabled &&
    input.detailLoading &&
    input.threadStarted &&
    input.providerReportsContextWindow !== false
  );
}

export function formatContextWindowCost(cost: {
  readonly amount: number;
  readonly currency: string;
}): string {
  const fractionDigits = Math.abs(cost.amount) > 0 && Math.abs(cost.amount) < 0.01 ? 4 : 2;
  return `${cost.currency} ${cost.amount.toFixed(fractionDigits)}`;
}

/** `253.9k` / `1M`: one decimal, trailing `.0` dropped. */
export function formatUsageTokens(value: number): string {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  if (value < 1_000) return String(Math.round(value));
  if (value < 1_000_000) return `${trim(value / 1_000)}k`;
  return `${trim(value / 1_000_000)}M`;
}

export interface ContextWindowSegment {
  readonly key: "cached" | "input" | "output" | "reasoning";
  readonly label: string;
  readonly tokens: number;
  /** Share of the whole context window, 0-100. Segments sum to the used percentage. */
  readonly percent: number;
}

/**
 * Splits the used part of the context window by token kind. Providers report
 * the kinds independently of `usedTokens`, so shares are scaled to the used
 * percentage; without a breakdown the bar is one `input` segment.
 */
export function contextWindowSegments(usage: {
  readonly usedTokens: number;
  readonly usedPercentage: number | null;
  readonly inputTokens?: number | null | undefined;
  readonly cachedInputTokens?: number | null | undefined;
  readonly outputTokens?: number | null | undefined;
  readonly reasoningOutputTokens?: number | null | undefined;
}): ContextWindowSegment[] {
  const usedPercent = Math.max(0, Math.min(100, usage.usedPercentage ?? 0));
  const candidates: ReadonlyArray<Omit<ContextWindowSegment, "percent">> = [
    { key: "cached", label: "Cached input", tokens: usage.cachedInputTokens ?? 0 },
    { key: "input", label: "Input", tokens: usage.inputTokens ?? 0 },
    { key: "output", label: "Output", tokens: usage.outputTokens ?? 0 },
    { key: "reasoning", label: "Reasoning", tokens: usage.reasoningOutputTokens ?? 0 },
  ];
  const parts = candidates.filter((part) => part.tokens > 0);
  const total = parts.reduce((sum, part) => sum + part.tokens, 0);
  if (total === 0) {
    return usedPercent > 0
      ? [{ key: "input", label: "Used", tokens: usage.usedTokens, percent: usedPercent }]
      : [];
  }
  return parts.map((part) => ({ ...part, percent: (part.tokens / total) * usedPercent }));
}

/** `Max 5x` from an auth label like `Claude Max 5x Subscription`. */
export function formatPlanLabel(authLabel: string | null | undefined): string | null {
  const trimmed = authLabel
    ?.replace(/^Claude\s+/i, "")
    .replace(/\s+Subscription$/i, "")
    .trim();
  return trimmed ? trimmed : null;
}

const WINDOW_KIND_ORDER = { session: 0, weekly: 1, monthly: 2, other: 3 } as const;

/** Row label in the composer usage popover. */
export function formatUsageWindowLabel(window: {
  readonly kind: keyof typeof WINDOW_KIND_ORDER;
  readonly label: string;
}): string {
  if (window.kind === "session") return "Session limit";
  if (window.label === "Weekly") return "Weekly · all models";
  return window.label;
}

export function sortUsageWindows<W extends { readonly kind: keyof typeof WINDOW_KIND_ORDER }>(
  windows: readonly W[],
): W[] {
  return windows.toSorted((a, b) => WINDOW_KIND_ORDER[a.kind] - WINDOW_KIND_ORDER[b.kind]);
}

/** `Resets in 2 hr 53 min` within a day, otherwise `Resets Sun 9:00 AM`. */
export function formatUsageWindowReset(
  resetsAt: string | undefined,
  now: number,
  locale?: string,
): string | null {
  if (!resetsAt) return null;
  const resetMs = Date.parse(resetsAt);
  if (!Number.isFinite(resetMs)) return null;
  const remainingMs = resetMs - now;
  if (remainingMs <= 0) return "Resets now";
  if (remainingMs < 24 * 60 * 60_000) {
    const totalMinutes = Math.max(1, Math.round(remainingMs / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `Resets in ${minutes} min`;
    return minutes === 0 ? `Resets in ${hours} hr` : `Resets in ${hours} hr ${minutes} min`;
  }
  const formatted = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(resetMs);
  return `Resets ${formatted}`;
}
