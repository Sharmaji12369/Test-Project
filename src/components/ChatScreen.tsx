"use client";

import type { Models } from "appwrite";

import { Avatar } from "@/components/Avatar";
import { ConversationPanel } from "@/components/ConversationPanel";
import { PartnerList } from "@/components/PartnerList";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/hooks/useChat";

export function ChatScreen({
  user,
}: {
  user: Models.User<Models.DefaultPreferences>;
}) {
  const { signOut } = useAuth();
  const {
    partners,
    partnersLoading,
    activePartner,
    activeConversation,
    totalUnread,
    error,
    dismissError,
    selectPartner,
    sendMessage,
    retryMessage,
    discardMessage,
    loadOlderMessages,
    refreshPartners,
  } = useChat(user);

  const displayName = user.name || user.email;

  return (
    <div className="flex h-dvh flex-col bg-white dark:bg-slate-900">
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 bg-rose-600 px-4 py-2 text-sm text-white"
        >
          <span className="min-w-0">{error}</span>
          <button
            type="button"
            onClick={dismissError}
            className="shrink-0 rounded px-2 py-0.5 font-medium underline underline-offset-2 hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/*
          One sidebar drives both layouts: on mobile it fills the screen and is
          replaced by the conversation once a person is picked; from md up both
          panes are visible side by side.
        */}
        <aside
          className={`w-full shrink-0 flex-col border-r border-slate-200 bg-white md:flex md:w-80 lg:w-96 dark:border-slate-800 dark:bg-slate-900 ${
            activePartner ? "hidden" : "flex"
          }`}
        >
          <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <Avatar name={displayName} seed={user.$id} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900 dark:text-white">
                {displayName}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {user.email}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Log out
            </button>
          </header>

          <div className="flex items-baseline justify-between px-4 py-3">
            <h1 className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              People
            </h1>
            <span className="flex items-center gap-3">
              {totalUnread > 0 && (
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  {totalUnread} unread
                </span>
              )}
              {/* New sign-ups arrive over Realtime; this is the fallback when
                  that connection is unavailable. */}
              <button
                type="button"
                onClick={() => void refreshPartners()}
                className="text-xs font-medium text-slate-500 underline-offset-2 transition hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-white"
              >
                Refresh
              </button>
            </span>
          </div>

          <PartnerList
            partners={partners}
            loading={partnersLoading}
            activePartnerId={activePartner?.userId ?? null}
            onSelect={selectPartner}
          />
        </aside>

        <main className={`min-w-0 flex-1 ${activePartner ? "flex" : "hidden md:flex"}`}>
          {activePartner ? (
            <ConversationPanel
              partner={activePartner}
              messages={activeConversation.messages}
              loading={activeConversation.loading}
              hasMore={activeConversation.hasMore}
              selfId={user.$id}
              onBack={() => selectPartner(null)}
              onSend={sendMessage}
              onRetry={retryMessage}
              onDiscard={discardMessage}
              onLoadOlder={loadOlderMessages}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 px-6 text-center dark:bg-slate-950">
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Pick someone to chat with
                </h2>
                <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                  Choose a person from the list to open your conversation. Messages
                  arrive live, so you will see replies as they are sent.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
