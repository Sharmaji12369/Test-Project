"use client";

import { formatTime } from "@/lib/chat";
import type { ChatMessage } from "@/lib/types";

/** Delivery feedback on your own messages (bonus requirement). */
function DeliveryIndicator({
  message,
  onRetry,
  onDiscard,
}: {
  message: ChatMessage;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  if (message.status === "sending") {
    return <span className="text-indigo-200">Sending…</span>;
  }

  if (message.status === "failed") {
    return (
      <span className="flex items-center gap-2 text-rose-100">
        <span>Not sent</span>
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold underline underline-offset-2 hover:no-underline"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="font-semibold underline underline-offset-2 hover:no-underline"
        >
          Discard
        </button>
      </span>
    );
  }

  return (
    <span className="text-indigo-200">
      {formatTime(message.createdAt)}
      <span className="ml-1" aria-label={message.read ? "Read" : "Sent"}>
        {message.read ? "✓✓" : "✓"}
      </span>
    </span>
  );
}

export function MessageBubble({
  message,
  isOwn,
  onRetry,
  onDiscard,
}: {
  message: ChatMessage;
  isOwn: boolean;
  onRetry: (messageId: string) => void;
  onDiscard: (messageId: string) => void;
}) {
  const failed = message.status === "failed";

  return (
    <li className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85ch] min-w-0 rounded-2xl px-3.5 py-2 shadow-sm sm:max-w-[75%] ${
          isOwn
            ? failed
              ? "rounded-br-md bg-rose-600 text-white"
              : "rounded-br-md bg-indigo-600 text-white"
            : "rounded-bl-md bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700"
        } ${message.status === "sending" ? "opacity-80" : ""}`}
      >
        {!isOwn && (
          <p className="mb-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
            {message.senderName}
          </p>
        )}

        <p className="wrap-anywhere whitespace-pre-wrap">{message.body}</p>

        <p className="mt-1 flex justify-end text-[11px] leading-none">
          {isOwn ? (
            <DeliveryIndicator
              message={message}
              onRetry={() => onRetry(message.id)}
              onDiscard={() => onDiscard(message.id)}
            />
          ) : (
            <span className="text-slate-400 dark:text-slate-500">
              {formatTime(message.createdAt)}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}
