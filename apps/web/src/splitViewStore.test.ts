import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  closeSplitPane,
  openThreadInSplit,
  PRIMARY_PANE_ID,
  splitPaneId,
  withoutPrimaryDuplicate,
  type SplitViewLayout,
} from "./splitViewStore";

const ref = (threadId: string): ScopedThreadRef => ({
  environmentId: EnvironmentId.make("env"),
  threadId: ThreadId.make(threadId),
});
const empty: SplitViewLayout = { panes: [], activePaneId: PRIMARY_PANE_ID };

describe("openThreadInSplit", () => {
  it("adds a pane beside the route's thread and focuses it", () => {
    const next = openThreadInSplit(empty, ref("a"), ref("main"));
    expect(next.panes).toEqual([ref("a")]);
    expect(next.activePaneId).toBe(splitPaneId(ref("a")));
  });

  it("focuses a thread that is already on screen instead of duplicating it", () => {
    const layout = openThreadInSplit(empty, ref("a"), ref("main"));
    expect(openThreadInSplit(layout, ref("main"), ref("main"))).toEqual({
      panes: [ref("a")],
      activePaneId: PRIMARY_PANE_ID,
    });
    expect(openThreadInSplit({ ...layout, activePaneId: PRIMARY_PANE_ID }, ref("a"), null)).toEqual(
      layout,
    );
  });

  it("replaces the newest split pane once the 2x2 grid is full", () => {
    let layout = empty;
    for (const id of ["a", "b", "c", "d"]) {
      layout = openThreadInSplit(layout, ref(id), ref("main"));
    }
    expect(layout.panes).toEqual([ref("a"), ref("b"), ref("d")]);
    expect(layout.activePaneId).toBe(splitPaneId(ref("d")));
  });
});

describe("closeSplitPane", () => {
  it("returns focus to the route's pane when the active pane closes", () => {
    const layout = openThreadInSplit(empty, ref("a"), ref("main"));
    expect(closeSplitPane(layout, splitPaneId(ref("a")))).toEqual(empty);
  });

  it("keeps focus on another pane", () => {
    const layout: SplitViewLayout = { panes: [ref("a"), ref("b")], activePaneId: PRIMARY_PANE_ID };
    expect(closeSplitPane(layout, splitPaneId(ref("b")))).toEqual({
      panes: [ref("a")],
      activePaneId: PRIMARY_PANE_ID,
    });
  });
});

describe("withoutPrimaryDuplicate", () => {
  it("drops a split pane once the route shows the same thread", () => {
    const layout: SplitViewLayout = { panes: [ref("a"), ref("b")], activePaneId: PRIMARY_PANE_ID };
    expect(withoutPrimaryDuplicate(layout, ref("a")).panes).toEqual([ref("b")]);
    expect(withoutPrimaryDuplicate(layout, null)).toBe(layout);
  });
});
