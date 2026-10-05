"use client";

import { Fragment, useCallback, useLayoutEffect, useRef, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { MessageBubble } from "@/components/MessageBubble";
import { MessageComposer } from "@/components/MessageComposer";
import { Spinner } from "@/components/Spinner";
import { formatDayLabel, isNewDay } from "@/lib/chat";
import type { ChatMessage, ChatPartner } from "@/lib/types";

/** How close to the bottom still counts as "following the conversation". */
const STICK_TO_BOTTOM_THRESHOLD_PX = 120;

export function ConversationPanel({
  partner,
  messages,
  loading,
  hasMore,
  selfId,
  onBack,
  onSend,
  onRetry,
  onDiscard,
  onLoadOlder,
}: {
  partner: ChatPartner;
  messages: ChatMessage[];
  loading: boolean;
  hasMore: boolean;
  selfId: string;
  onBack: () => void;
  onSend: (body: string) => Promise<void>;
  onRetry: (messageId: string) => void;
  onDiscard: (messageId: string) => void;
  onLoadOlder: () => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Whether the view was pinned to the bottom *before* this render's new
  // messages were painted. Read in useLayoutEffect, so it must be a ref.
  const wasAtBottom = useRef(true);
  const lastMessage = messages.at(-1);
  const messageCount = messages.length;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    setShowJumpToLatest(false);
  }, []);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    const atBottom = distanceFromBottom <= STICK_TO_BOTTOM_THRESHOLD_PX;
    wasAtBottom.current = atBottom;
    setShowJumpToLatest(!atBottom);
  }, []);

  // Jump to the newest message when a conversation opens.
  useLayoutEffect(() => {
    wasAtBottom.current = true;
    scrollToBottom("auto");
  }, [partner.userId, scrollToBottom]);

  // Auto-scroll on new messages, but only when the user is already following
  // along or sent the message themselves — never yank them away from history
  // they scrolled up to read.
  useLayoutEffect(() => {
    if (messageCount === 0) return;
    const ownLastMessage = lastMessage?.senderId === selfId;
    if (wasAtBottom.current || ownLastMessage) {
      scrollToBottom(ownLastMessage ? "smooth" : "auto");
    } else {
      setShowJumpToLatest(true);
    }
  }, [messageCount, lastMessage?.id, lastMessage?.senderId, selfId, scrollToBottom]);

  async function handleLoadOlder() {
    const element = scrollRef.current;
    const previousHeight = element?.scrollHeight ?? 0;
    const previousTop = element?.scrollTop ?? 0;

    setLoadingOlder(true);
    try {
      await onLoadOlder();
    } finally {
      setLoadingOlder(false);
    }

    // Keep the reading position steady as content is prepended above.
    requestAnimationFrame(() => {
      const current = scrollRef.current;
      if (!current) return;
      current.scrollTop = previousTop + (current.scrollHeight - previousHeight);
    });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Back to people"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            <path d="M12.7 15.3a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 1 1 1.4 1.4L8.42 9.6l4.3 4.3a1 1 0 0 1 0 1.4Z" />
          </svg>
        </button>

        <Avatar name={partner.name} seed={partner.userId} />
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-slate-900 dark:text-white">
            {partner.name}
          </h2>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {partner.email}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto px-3 py-4"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner label="Loading messages…" />
            </div>
          ) : (
            <>
              {hasMore && (
                <div className="mb-4 flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadOlder}
                    disabled={loadingOlder}
                    className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {loadingOlder ? "Loading…" : "Load earlier messages"}
                  </button>
                </div>
              )}

              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <Avatar name={partner.name} seed={partner.userId} size="lg" />
                  <p className="mt-3 font-medium text-slate-700 dark:text-slate-200">
                    This is the start of your conversation with {partner.name}.
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Say hello to get things going.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {messages.map((message, index) => (
                    // A Fragment, not a wrapper element: a <div> here would be
                    // invalid inside <ul>, breaking list semantics and spacing.
                    <Fragment key={message.id}>
                      {isNewDay(messages[index - 1]?.createdAt, message.createdAt) && (
                        <li className="flex justify-center py-2">
                          <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {formatDayLabel(message.createdAt)}
                          </span>
                        </li>
                      )}
                      <MessageBubble
                        message={message}
                        isOwn={message.senderId === selfId}
                        onRetry={onRetry}
                        onDiscard={onDiscard}
                      />
                    </Fragment>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {showJumpToLatest && messageCount > 0 && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            Jump to latest ↓
          </button>
        )}
      </div>

      <MessageComposer recipientName={partner.name} onSend={onSend} />
    </section>
  );
}
