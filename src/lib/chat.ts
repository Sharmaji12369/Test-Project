import type { ChatMessage, MessageRow } from "./types";

/**
 * A conversation ID that both participants derive identically: the two user IDs
 * sorted and joined. This makes a one-to-one conversation addressable with a
 * single equality query, and means either participant computes the same value
 * without a lookup table.
 */
export function conversationIdFor(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join("_");
}

/** The other participant's user ID, given a conversation ID and your own. */
export function partnerIdFrom(conversationId: string, selfId: string): string | null {
  const parts = conversationId.split("_");
  if (parts.length !== 2) return null;
  const [first, second] = parts;
  if (first === selfId) return second;
  if (second === selfId) return first;
  return null;
}

/** Maps a stored row onto the UI message shape. Stored rows are always sent. */
export function messageFromRow(row: MessageRow): ChatMessage {
  return {
    id: row.$id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    recipientId: row.recipientId,
    senderName: row.senderName,
    body: row.body,
    createdAt: row.$createdAt,
    read: Boolean(row.read),
    status: "sent",
  };
}

/** Keeps a conversation ordered oldest-first after an out-of-order insert. */
export function sortByCreatedAt(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    const delta = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}

/** Inserts or replaces a message, keyed by ID, and re-sorts. */
export function upsertMessage(
  messages: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  const index = messages.findIndex((message) => message.id === incoming.id);
  if (index === -1) return sortByCreatedAt([...messages, incoming]);

  const next = [...messages];
  next[index] = { ...next[index], ...incoming };
  return sortByCreatedAt(next);
}

/** Initials for the avatar, e.g. "Ada Lovelace" -> "AL". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Clock time for a message bubble, e.g. "14:03". */
export function formatTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Day separator label: "Today", "Yesterday", or a dated label. */
export function formatDayLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";

  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

  const dayDelta = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86_400_000,
  );

  if (dayDelta === 0) return "Today";
  if (dayDelta === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: dayDelta > 365 ? "numeric" : undefined,
  });
}

/** True when two messages fall on different calendar days. */
export function isNewDay(previousIso: string | undefined, currentIso: string): boolean {
  if (!previousIso) return true;
  return new Date(previousIso).toDateString() !== new Date(currentIso).toDateString();
}

export const MAX_MESSAGE_LENGTH = 4000;

/** Shared validation so the composer and the send path agree on what is sendable. */
export function validateMessageBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return "Message cannot be empty.";
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`;
  }
  return null;
}
