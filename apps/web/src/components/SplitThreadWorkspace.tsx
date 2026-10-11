import { type ReactNode, useEffect, useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import { PRIMARY_PANE_ID, splitPaneId, useSplitViewStore } from "../splitViewStore";
import type { ThreadRouteTarget } from "../threadRoutes";
import {
  ComposerHandleContext,
  type ComposerHandleRef,
  useComposerHandleContext,
} from "../composerHandleContext";
import ChatView from "./ChatView";
import type { ChatComposerHandle } from "./chat/ChatComposer";
import { ChatPaneProvider, isChatPaneActive } from "./chat/chatPane";
import { ThreadRouteView } from "./ThreadRouteView";
import { SidebarInset } from "./ui/sidebar";

const GRID_CLASS_BY_PANE_COUNT: Record<number, string> = {
  2: "grid-cols-2 grid-rows-1",
  3: "grid-cols-2 grid-rows-2",
  4: "grid-cols-2 grid-rows-2",
};

/**
 * Gives a pane its own composer handle. The app-wide handle (command palette,
 * file panels) follows the active pane, so it never points at whichever
 * composer mounted last.
 */
function SplitPaneComposerScope({
  paneId,
  registry,
  children,
}: {
  paneId: string;
  registry: Map<string, ComposerHandleRef>;
  children: ReactNode;
}) {
  const appComposerRef = useComposerHandleContext();
  const paneComposerRef = useMemo<ComposerHandleRef>(() => {
    let current: ChatComposerHandle | null = null;
    return {
      get current() {
        return current;
      },
      set current(handle) {
        current = handle;
        if (appComposerRef && isChatPaneActive(paneId)) appComposerRef.current = handle;
      },
    };
  }, [appComposerRef, paneId]);
  useEffect(() => {
    registry.set(paneId, paneComposerRef);
    return () => {
      registry.delete(paneId);
    };
  }, [paneComposerRef, paneId, registry]);
  return <ComposerHandleContext value={paneComposerRef}>{children}</ComposerHandleContext>;
}

/**
 * The chat area: the route's thread alone, or a grid of up to four threads.
 * The route's thread stays the first pane, so URLs, draft promotion and the
 * sidebar keep working unchanged; the other panes are server threads opened
 * beside it.
 */
export function SplitThreadWorkspace({ target }: { target: ThreadRouteTarget }) {
  const panes = useSplitViewStore((state) => state.panes);
  const activePaneId = useSplitViewStore((state) => state.activePaneId);
  const activatePane = useSplitViewStore((state) => state.activatePane);
  const dropPrimaryDuplicate = useSplitViewStore((state) => state.dropPrimaryDuplicate);
  const appComposerRef = useComposerHandleContext();
  const [composerRegistry] = useState(() => new Map<string, ComposerHandleRef>());
  const primaryRef = target.kind === "server" ? target.threadRef : null;
  const primaryKey = primaryRef ? splitPaneId(primaryRef) : null;

  // Navigating the route to a thread another pane shows would put it on screen twice.
  useEffect(() => {
    if (primaryRef !== null) dropPrimaryDuplicate(primaryRef);
    // primaryKey identifies primaryRef.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryKey, dropPrimaryDuplicate]);

  useEffect(() => {
    if (appComposerRef && panes.length > 0) {
      appComposerRef.current = composerRegistry.get(activePaneId)?.current ?? null;
    }
  }, [activePaneId, appComposerRef, composerRegistry, panes.length]);

  if (panes.length === 0) {
    return <ThreadRouteView target={target} />;
  }

  const cells = [
    { id: PRIMARY_PANE_ID, content: <ThreadRouteView target={target} bare /> },
    ...panes.map((ref) => ({
      id: splitPaneId(ref),
      content: (
        <ChatView environmentId={ref.environmentId} threadId={ref.threadId} routeKind="server" />
      ),
    })),
  ];

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none md:h-dvh">
      <div
        className={cn(
          "grid size-full min-h-0 gap-px bg-border",
          GRID_CLASS_BY_PANE_COUNT[cells.length],
        )}
      >
        {cells.map((cell, index) => (
          <section
            key={cell.id}
            aria-label={index === 0 ? "Main thread" : "Split thread"}
            data-split-pane={cell.id}
            data-split-pane-active={cell.id === activePaneId ? "true" : undefined}
            // A transform makes this pane the containing block for the chat's
            // fixed-position title bar controls, keeping them in their pane.
            className={cn(
              "relative flex min-h-0 min-w-0 transform-gpu flex-col overflow-hidden bg-background",
              cells.length === 3 && index === 2 && "col-span-2",
              "after:pointer-events-none after:absolute after:inset-0 after:z-60 after:border after:border-transparent",
              cell.id === activePaneId && "after:border-primary/60",
            )}
            onPointerDownCapture={() => activatePane(cell.id)}
            onFocusCapture={() => activatePane(cell.id)}
          >
            <ChatPaneProvider value={cell.id}>
              <SplitPaneComposerScope paneId={cell.id} registry={composerRegistry}>
                {cell.content}
              </SplitPaneComposerScope>
            </ChatPaneProvider>
          </section>
        ))}
      </div>
    </SidebarInset>
  );
}
