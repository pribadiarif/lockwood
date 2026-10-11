import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

/** The route's own thread. It always occupies the first pane. */
export const PRIMARY_PANE_ID = "primary";
/** Total panes, the route's pane included: a 2x2 grid at most. */
export const MAX_SPLIT_PANES = 4;

export interface SplitViewLayout {
  /** Threads beside the route's thread, in grid order. */
  readonly panes: ReadonlyArray<ScopedThreadRef>;
  /** `PRIMARY_PANE_ID` or the thread key of a split pane. */
  readonly activePaneId: string;
}

export const splitPaneId = (ref: ScopedThreadRef): string => scopedThreadKey(ref);

/**
 * Opens a thread beside the route's thread and focuses it. A thread already on
 * screen is focused instead of duplicated; with the grid full, the newest split
 * pane is replaced.
 */
export function openThreadInSplit(
  layout: SplitViewLayout,
  ref: ScopedThreadRef,
  primaryRef: ScopedThreadRef | null,
): SplitViewLayout {
  const id = splitPaneId(ref);
  if (primaryRef !== null && splitPaneId(primaryRef) === id) {
    return { ...layout, activePaneId: PRIMARY_PANE_ID };
  }
  if (layout.panes.some((pane) => splitPaneId(pane) === id)) {
    return { ...layout, activePaneId: id };
  }
  const kept =
    layout.panes.length >= MAX_SPLIT_PANES - 1
      ? layout.panes.slice(0, MAX_SPLIT_PANES - 2)
      : layout.panes;
  return { panes: [...kept, ref], activePaneId: id };
}

/** Closes a split pane; focus falls back to the route's pane. */
export function closeSplitPane(layout: SplitViewLayout, id: string): SplitViewLayout {
  const panes = layout.panes.filter((pane) => splitPaneId(pane) !== id);
  if (panes.length === layout.panes.length) return layout;
  return {
    panes,
    activePaneId: layout.activePaneId === id ? PRIMARY_PANE_ID : layout.activePaneId,
  };
}

/** Drops a split pane that now shows the route's thread, so no thread appears twice. */
export function withoutPrimaryDuplicate(
  layout: SplitViewLayout,
  primaryRef: ScopedThreadRef | null,
): SplitViewLayout {
  return primaryRef === null ? layout : closeSplitPane(layout, splitPaneId(primaryRef));
}

interface SplitViewStoreState extends SplitViewLayout {
  openInSplit: (ref: ScopedThreadRef, primaryRef: ScopedThreadRef | null) => void;
  closePane: (id: string) => void;
  activatePane: (id: string) => void;
  dropPrimaryDuplicate: (primaryRef: ScopedThreadRef | null) => void;
}

const isThreadRef = Schema.is(ScopedThreadRef);

export const useSplitViewStore = create<SplitViewStoreState>()(
  persist(
    (set) => ({
      panes: [],
      activePaneId: PRIMARY_PANE_ID,
      openInSplit: (ref, primaryRef) => set((state) => openThreadInSplit(state, ref, primaryRef)),
      closePane: (id) => set((state) => closeSplitPane(state, id)),
      activatePane: (id) =>
        set((state) => (state.activePaneId === id ? state : { activePaneId: id })),
      dropPrimaryDuplicate: (primaryRef) =>
        set((state) => withoutPrimaryDuplicate(state, primaryRef)),
    }),
    {
      name: "t3code:split-view:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      version: 1,
      partialize: ({ panes }) => ({ panes }),
      merge: (persisted, current) => {
        const panes = (persisted as { panes?: unknown } | null)?.panes;
        return {
          ...current,
          panes: Array.isArray(panes)
            ? panes.filter(isThreadRef).slice(0, MAX_SPLIT_PANES - 1)
            : [],
        };
      },
    },
  ),
);
