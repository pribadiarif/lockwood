import { describe, expect, it } from "vite-plus/test";
import { resolveComposerPromptSuggestion } from "./composerPromptSuggestion";

describe("resolveComposerPromptSuggestion", () => {
  const suggestion = { text: "now run the tests", createdAtMs: Date.parse("2026-10-11T10:05:00Z") };

  it("offers the suggestion after the run that produced it settles", () => {
    expect(
      resolveComposerPromptSuggestion({
        suggestion,
        latestRunRequestedAt: "2026-10-11T10:00:00Z",
        latestRunSettled: true,
      }),
    ).toBe("now run the tests");
  });

  it("hides it while a run is in progress", () => {
    expect(
      resolveComposerPromptSuggestion({
        suggestion,
        latestRunRequestedAt: "2026-10-11T10:00:00Z",
        latestRunSettled: false,
      }),
    ).toBeNull();
  });

  it("drops it once a newer run was requested", () => {
    expect(
      resolveComposerPromptSuggestion({
        suggestion,
        latestRunRequestedAt: "2026-10-11T10:06:00Z",
        latestRunSettled: true,
      }),
    ).toBeNull();
  });

  it("ignores blank suggestions", () => {
    expect(
      resolveComposerPromptSuggestion({
        suggestion: { ...suggestion, text: "   " },
        latestRunRequestedAt: null,
        latestRunSettled: true,
      }),
    ).toBeNull();
  });
});
