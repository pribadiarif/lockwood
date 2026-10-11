/**
 * The provider's predicted next prompt, offered as the composer placeholder
 * (Tab accepts it) while the latest run is settled and nothing newer has been
 * requested since the suggestion arrived.
 */
export function resolveComposerPromptSuggestion(input: {
  readonly suggestion: { readonly text: string; readonly createdAtMs: number } | null;
  readonly latestRunRequestedAt: string | null;
  readonly latestRunSettled: boolean;
}): string | null {
  const { suggestion } = input;
  if (suggestion === null || !input.latestRunSettled) return null;
  const text = suggestion.text.trim();
  if (text.length === 0) return null;
  if (input.latestRunRequestedAt !== null) {
    const requestedAtMs = Date.parse(input.latestRunRequestedAt);
    if (Number.isFinite(requestedAtMs) && suggestion.createdAtMs < requestedAtMs) return null;
  }
  return text;
}
