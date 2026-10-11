import type { ServerProviderUsageLimits } from "@t3tools/contracts";
import { ArrowRightIcon, Minimize2Icon } from "lucide-react";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Separator } from "../ui/separator";
import {
  type ContextWindowSegment,
  contextWindowSegments,
  formatContextWindowCompactionMessage,
  formatContextWindowCost,
  formatUsageTokens,
  formatUsageWindowLabel,
  formatUsageWindowReset,
  sortUsageWindows,
} from "./ContextWindowMeter.logic";
import { composerFloatingLayerProps } from "./composerEventScope";

function formatPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (value < 10) {
    return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  }
  return `${Math.round(value)}%`;
}

const SEGMENT_CLASS_NAME: Record<ContextWindowSegment["key"], string> = {
  cached: "bg-info",
  input: "bg-warning",
  output: "bg-success",
  reasoning: "bg-muted-foreground/45",
};

/**
 * Composer ring for the active thread's context window. Its popover also shows
 * the selected provider's plan usage limits, so it renders when either is known.
 */
export function ContextWindowMeter(props: {
  usage: ContextWindowSnapshot | null;
  usageLimits?: ServerProviderUsageLimits | null | undefined;
  planLabel?: string | null | undefined;
  modelDisplayName?: string | null;
  onOpenUsage?: (() => void) | undefined;
  onCompact?: (() => void) | undefined;
  compactDisabled?: boolean | undefined;
  compactDisabledReason?: string | null | undefined;
}) {
  const {
    usage,
    usageLimits,
    planLabel,
    modelDisplayName,
    onOpenUsage,
    onCompact,
    compactDisabled,
    compactDisabledReason,
  } = props;
  const usedPercentage = usage ? formatPercentage(usage.usedPercentage) : null;
  const normalizedPercentage = Math.max(0, Math.min(100, usage?.usedPercentage ?? 0));
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - normalizedPercentage / 100);
  const isOverloaded = normalizedPercentage > 90;
  const usageColor = isOverloaded
    ? "var(--color-error)"
    : "color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)";
  const limitWindows = usageLimits ? sortUsageWindows(usageLimits.windows) : [];

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={150}
        render={
          <Button
            size="icon-sm"
            variant="ghost-muted"
            className="size-7"
            aria-label={
              usage === null
                ? "Usage"
                : usage.maxTokens != null && usedPercentage
                  ? `Context window ${usedPercentage} used`
                  : `Context window ${formatContextWindowTokens(usage.usedTokens)} tokens used`
            }
          >
            <span className="relative flex size-5 items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="-rotate-90 absolute inset-0 size-full transform-gpu mx-0!"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  className="stroke-muted-foreground/24"
                  strokeWidth="3"
                />
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke={usageColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none"
                />
              </svg>
            </span>
          </Button>
        }
      />
      <PopoverPopup
        {...composerFloatingLayerProps}
        side="top"
        align="end"
        padding="none"
        width="lg"
        className="text-left whitespace-normal"
      >
        <div className="flex flex-col gap-3 py-3">
          {usage ? (
            <ContextWindowSection usage={usage} modelDisplayName={modelDisplayName ?? null} />
          ) : null}
          {usage && limitWindows.length > 0 ? <Separator /> : null}
          {limitWindows.length > 0 ? (
            <UsageLimitsSection
              windows={limitWindows}
              planLabel={planLabel ?? null}
              onOpenUsage={onOpenUsage}
            />
          ) : null}
          {onOpenUsage || (usage && onCompact) ? (
            <>
              <Separator />
              <div className="flex flex-wrap items-center gap-2 px-(--floating-content-inset)">
                {onOpenUsage ? (
                  <Button size="xs" variant="outline" onClick={onOpenUsage}>
                    See detailed breakdown
                  </Button>
                ) : null}
                {usage && onCompact ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={compactDisabled}
                    onClick={onCompact}
                  >
                    <Minimize2Icon aria-hidden="true" />
                    Compact context
                  </Button>
                ) : null}
              </div>
              {usage && onCompact && compactDisabled && compactDisabledReason ? (
                <div className="px-(--floating-content-inset) text-pretty text-secondary-label text-2xs">
                  {compactDisabledReason}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function ContextWindowSection(props: {
  usage: ContextWindowSnapshot;
  modelDisplayName: string | null;
}) {
  const { usage, modelDisplayName } = props;
  const usedPercentage = formatPercentage(usage.usedPercentage);
  const segments = contextWindowSegments(usage);
  const totalProcessedTokens = usage.totalProcessedTokens ?? null;

  return (
    <div className="flex flex-col gap-2 px-(--floating-content-inset)">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Context window</span>
        <span className="text-muted-foreground tabular-nums">
          {usage.maxTokens != null
            ? `${formatUsageTokens(usage.usedTokens)} / ${formatUsageTokens(usage.maxTokens)}${
                usedPercentage ? ` (${usedPercentage})` : ""
              }`
            : formatUsageTokens(usage.usedTokens)}
        </span>
      </div>
      {usage.maxTokens != null ? (
        <div
          className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted/60"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usage.usedPercentage ?? 0)}
          aria-label="Context window usage"
        >
          {segments.map((segment) => (
            <div
              key={segment.key}
              className={cn("h-full rounded-full", SEGMENT_CLASS_NAME[segment.key])}
              style={{ width: `${segment.percent}%` }}
            />
          ))}
        </div>
      ) : null}
      {segments.length > 1 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-secondary-label">
          {segments.map((segment) => (
            <span key={segment.key} className="inline-flex items-center gap-1">
              <span
                aria-hidden="true"
                className={cn("size-1.5 rounded-full", SEGMENT_CLASS_NAME[segment.key])}
              />
              {segment.label} {formatUsageTokens(segment.tokens)}
            </span>
          ))}
        </div>
      ) : null}
      {totalProcessedTokens !== null && totalProcessedTokens > 0 ? (
        <div className="flex items-center justify-between gap-3 text-2xs text-secondary-label">
          <span>Total processed</span>
          <span className="tabular-nums">{formatUsageTokens(totalProcessedTokens)}</span>
        </div>
      ) : null}
      {usage.cost != null ? (
        <div className="flex items-center justify-between gap-3 text-2xs text-secondary-label">
          <span>Cost</span>
          <span className="tabular-nums">{formatContextWindowCost(usage.cost)}</span>
        </div>
      ) : null}
      {usage.compactsAutomatically ? (
        <div className="text-pretty text-2xs text-secondary-label">
          {formatContextWindowCompactionMessage(modelDisplayName, usage.autoCompactThreshold)}
        </div>
      ) : null}
    </div>
  );
}

function UsageLimitsSection(props: {
  windows: ServerProviderUsageLimits["windows"];
  planLabel: string | null;
  onOpenUsage: (() => void) | undefined;
}) {
  const { windows, planLabel, onOpenUsage } = props;
  const now = Date.parse(useNowMinute());
  const title = planLabel ? `Plan usage limits · ${planLabel}` : "Plan usage limits";

  return (
    <div className="flex flex-col gap-3 px-(--floating-content-inset)">
      {onOpenUsage ? (
        <button
          type="button"
          onClick={onOpenUsage}
          className="-my-0.5 flex cursor-pointer items-center justify-between gap-3 rounded-md text-left text-sm text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="truncate">{title}</span>
          <ArrowRightIcon aria-hidden="true" className="size-3.5 shrink-0" />
        </button>
      ) : (
        <div className="truncate text-sm text-muted-foreground">{title}</div>
      )}
      {windows.map((window) => {
        const usedPercent = Math.round(window.usedPercent);
        const reset = formatUsageWindowReset(window.resetsAt, now);
        return (
          <div key={window.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-foreground">
                {formatUsageWindowLabel(window)}
              </span>
              <span className="flex shrink-0 items-baseline gap-2 text-muted-foreground tabular-nums">
                {reset ? <span>{reset}</span> : null}
                <span>{usedPercent}%</span>
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={usedPercent}
              aria-label={`${formatUsageWindowLabel(window)} usage`}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
                  usedPercent >= 90 ? "bg-error" : "bg-info",
                )}
                style={{ width: `${usedPercent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Holds the meter's footprint while a thread's activities are still loading. */
export function ContextWindowMeterPlaceholder() {
  return <span aria-hidden="true" className="size-7 shrink-0" />;
}
