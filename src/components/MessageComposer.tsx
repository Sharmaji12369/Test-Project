"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { MAX_MESSAGE_LENGTH, validateMessageBody } from "@/lib/chat";

export function MessageComposer({
  recipientName,
  onSend,
}: {
  recipientName: string;
  onSend: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Empty (or whitespace-only) messages are blocked here, in the submit handler,
  // and again in the send path before any write.
  const canSend = validateMessageBody(body) === null;

  function resize() {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;

    const outgoing = body;
    // Clear immediately so typing can continue while the row is written.
    setBody("");
    requestAnimationFrame(resize);
    await onSend(outgoing);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter inserts a newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900"
    >
      <label htmlFor="message-input" className="sr-only">
        Message {recipientName}
      </label>
      <textarea
        id="message-input"
        ref={textareaRef}
        rows={1}
        value={body}
        maxLength={MAX_MESSAGE_LENGTH}
        onChange={(event) => {
          setBody(event.target.value);
          resize();
        }}
        onKeyDown={handleKeyDown}
        placeholder={`Message ${recipientName}…`}
        className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
      />
      <button
        type="submit"
        disabled={!canSend}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-indigo-600 px-4 font-medium text-white transition hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-offset-slate-900"
      >
        <span className="hidden sm:inline">Send</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M1.3 2.6a1 1 0 0 1 1.07-.15l15 7a1 1 0 0 1 0 1.8l-15 7A1 1 0 0 1 1 17.3L2.9 10 1 2.7a1 1 0 0 1 .3-.1Z" />
        </svg>
        <span className="sr-only">Send message</span>
      </button>
    </form>
  );
}
