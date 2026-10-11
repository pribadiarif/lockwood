import { createContext, useContext } from "react";

import { PRIMARY_PANE_ID, useSplitViewStore } from "../../splitViewStore";

/**
 * Which split-view pane a ChatView renders in. Window-level keys, pastes and
 * focus requests belong to the active pane only, so every pane checks it at
 * event time instead of racing the others.
 */
const ChatPaneContext = createContext<string>(PRIMARY_PANE_ID);

export const ChatPaneProvider = ChatPaneContext.Provider;

export const useChatPaneId = (): string => useContext(ChatPaneContext);

/** Read at event time from window-level handlers. */
export const isChatPaneActive = (paneId: string): boolean =>
  useSplitViewStore.getState().activePaneId === paneId;

export const useIsChatPaneActive = (paneId: string): boolean =>
  useSplitViewStore((state) => state.activePaneId === paneId);

/** Whether more than one thread is on screen. */
export const useIsSplitView = (): boolean => useSplitViewStore((state) => state.panes.length > 0);
