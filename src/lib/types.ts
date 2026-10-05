import type { Models } from "appwrite";

/** A row in the `profiles` table — the public directory of registered users. */
export type ProfileRow = Models.Row & {
  userId: string;
  name: string;
  email: string;
};

/** A row in the `messages` table. */
export type MessageRow = Models.Row & {
  conversationId: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  body: string;
  read: boolean;
};

/** Delivery state of a message in the UI (bonus requirement). */
export type DeliveryStatus = "sending" | "sent" | "failed";

/**
 * A message as the UI holds it. Optimistic messages exist here before they
 * exist in Appwrite; `id` is generated client-side with `ID.unique()` so the
 * optimistic entry and the row that comes back over Realtime share an ID and
 * reconcile without duplicating.
 */
export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  body: string;
  createdAt: string;
  read: boolean;
  status: DeliveryStatus;
};

/** A person you can chat with, plus the unread count for that conversation. */
export type ChatPartner = {
  userId: string;
  name: string;
  email: string;
  unreadCount: number;
};
