"use client";

import {
  AppwriteException,
  ID,
  Permission,
  Query,
  Role,
  type Models,
  type RealtimeResponseEvent,
  type RealtimeSubscription,
} from "appwrite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  describeError,
  messagesChannel,
  profilesChannel,
  realtime,
  tablesDB,
} from "@/lib/appwrite";
import { appwriteConfig } from "@/lib/env";
import {
  conversationIdFor,
  messageFromRow,
  upsertMessage,
  validateMessageBody,
} from "@/lib/chat";
import type { ChatMessage, ChatPartner, MessageRow, ProfileRow } from "@/lib/types";

const MESSAGE_PAGE_SIZE = 40;
const MAX_PARTNERS = 200;
const MAX_UNREAD_SCAN = 500;

type ConversationState = {
  messages: ChatMessage[];
  /** False once the oldest message has been loaded. */
  hasMore: boolean;
  loading: boolean;
};

const EMPTY_CONVERSATION: ConversationState = {
  messages: [],
  hasMore: false,
  loading: true,
};

type UseChatResult = {
  partners: ChatPartner[];
  partnersLoading: boolean;
  activePartner: ChatPartner | null;
  activeConversation: ConversationState;
  totalUnread: number;
  error: string | null;
  dismissError: () => void;
  selectPartner: (userId: string | null) => void;
  sendMessage: (body: string) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  discardMessage: (messageId: string) => void;
  loadOlderMessages: () => Promise<void>;
  refreshPartners: () => Promise<void>;
};

export function useChat(
  currentUser: Models.User<Models.DefaultPreferences>,
): UseChatResult {
  const selfId = currentUser.$id;
  const selfName = currentUser.name || currentUser.email;

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null);
  const [unreadByPartner, setUnreadByPartner] = useState<Record<string, number>>({});
  const [conversations, setConversations] = useState<Record<string, ConversationState>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);

  // Mirrors of state the long-lived Realtime handler needs to read. Keeping
  // them in refs lets the subscription stay open for the lifetime of the chat
  // screen instead of tearing down and reopening on every state change.
  const activePartnerIdRef = useRef<string | null>(null);
  useEffect(() => {
    activePartnerIdRef.current = activePartnerId;
  }, [activePartnerId]);

  const activeConversationId = activePartnerId
    ? conversationIdFor(selfId, activePartnerId)
    : null;

  /** Bodies of messages still in flight, so a failed send can be retried. */
  const pendingBodies = useRef<Map<string, { body: string; recipientId: string }>>(
    new Map(),
  );

  const loadProfiles = useCallback(async () => {
    try {
      const result = await tablesDB.listRows<ProfileRow>({
        databaseId: appwriteConfig.databaseId,
        tableId: appwriteConfig.profilesTableId,
        queries: [Query.orderAsc("name"), Query.limit(MAX_PARTNERS)],
      });
      setProfiles(result.rows.filter((profile) => profile.userId !== selfId));
    } catch (caught) {
      setError(describeError(caught, "Could not load the list of users."));
    } finally {
      setPartnersLoading(false);
    }
  }, [selfId]);

  /** Seeds unread badges from messages addressed to you that are still unread. */
  const loadUnreadCounts = useCallback(async () => {
    try {
      const result = await tablesDB.listRows<MessageRow>({
        databaseId: appwriteConfig.databaseId,
        tableId: appwriteConfig.messagesTableId,
        queries: [
          Query.equal("recipientId", selfId),
          Query.equal("read", false),
          Query.limit(MAX_UNREAD_SCAN),
        ],
      });

      const counts: Record<string, number> = {};
      for (const row of result.rows) {
        counts[row.senderId] = (counts[row.senderId] ?? 0) + 1;
      }
      setUnreadByPartner(counts);
    } catch {
      // Unread badges are an enhancement; chat still works without them.
    }
  }, [selfId]);

  useEffect(() => {
    void (async () => {
      await loadProfiles();
      await loadUnreadCounts();
    })();
  }, [loadProfiles, loadUnreadCounts]);

  /**
   * Marks every message you received in a conversation as read, then clears the
   * badge. Permission to update is granted to the recipient when the row is
   * created, so this is the recipient updating their own copy's read flag.
   */
  const markConversationRead = useCallback(
    async (partnerId: string) => {
      const conversationId = conversationIdFor(selfId, partnerId);

      setUnreadByPartner((previous) => {
        if (!previous[partnerId]) return previous;
        const next = { ...previous };
        delete next[partnerId];
        return next;
      });

      let unreadRows: MessageRow[] = [];
      try {
        const result = await tablesDB.listRows<MessageRow>({
          databaseId: appwriteConfig.databaseId,
          tableId: appwriteConfig.messagesTableId,
          queries: [
            Query.equal("conversationId", conversationId),
            Query.equal("recipientId", selfId),
            Query.equal("read", false),
            Query.limit(MAX_UNREAD_SCAN),
          ],
        });
        unreadRows = result.rows;
      } catch {
        return;
      }

      await Promise.allSettled(
        unreadRows.map((row) =>
          tablesDB.updateRow<MessageRow>({
            databaseId: appwriteConfig.databaseId,
            tableId: appwriteConfig.messagesTableId,
            rowId: row.$id,
            data: { read: true },
          }),
        ),
      );
    },
    [selfId],
  );

  /** Loads the most recent page of a conversation the first time it is opened. */
  const loadConversation = useCallback(
    async (partnerId: string) => {
      const conversationId = conversationIdFor(selfId, partnerId);

      try {
        const result = await tablesDB.listRows<MessageRow>({
          databaseId: appwriteConfig.databaseId,
          tableId: appwriteConfig.messagesTableId,
          queries: [
            Query.equal("conversationId", conversationId),
            Query.orderDesc("$createdAt"),
            Query.limit(MESSAGE_PAGE_SIZE),
          ],
        });

        // Fetched newest-first for the limit to mean "most recent"; the UI
        // renders oldest-first.
        const page = result.rows.map(messageFromRow).reverse();

        setConversations((previous) => {
          const existing = previous[conversationId]?.messages ?? [];
          // Realtime may have delivered messages while this request was open.
          const merged = page.reduce(
            (accumulator, message) => upsertMessage(accumulator, message),
            existing,
          );
          return {
            ...previous,
            [conversationId]: {
              messages: merged,
              hasMore: result.rows.length === MESSAGE_PAGE_SIZE,
              loading: false,
            },
          };
        });
      } catch (caught) {
        setConversations((previous) => ({
          ...previous,
          [conversationId]: {
            messages: previous[conversationId]?.messages ?? [],
            hasMore: false,
            loading: false,
          },
        }));
        setError(describeError(caught, "Could not load this conversation."));
      }
    },
    [selfId],
  );

  const loadOlderMessages = useCallback(async () => {
    const partnerId = activePartnerIdRef.current;
    if (!partnerId) return;

    const conversationId = conversationIdFor(selfId, partnerId);
    const current = conversations[conversationId];
    const oldest = current?.messages.find((message) => message.status === "sent");
    if (!current || !current.hasMore || !oldest) return;

    try {
      const result = await tablesDB.listRows<MessageRow>({
        databaseId: appwriteConfig.databaseId,
        tableId: appwriteConfig.messagesTableId,
        queries: [
          Query.equal("conversationId", conversationId),
          Query.orderDesc("$createdAt"),
          Query.cursorAfter(oldest.id),
          Query.limit(MESSAGE_PAGE_SIZE),
        ],
      });

      const olderPage = result.rows.map(messageFromRow);

      setConversations((previous) => {
        const existing = previous[conversationId];
        if (!existing) return previous;
        const merged = olderPage.reduce(
          (accumulator, message) => upsertMessage(accumulator, message),
          existing.messages,
        );
        return {
          ...previous,
          [conversationId]: {
            ...existing,
            messages: merged,
            hasMore: result.rows.length === MESSAGE_PAGE_SIZE,
          },
        };
      });
    } catch (caught) {
      setError(describeError(caught, "Could not load earlier messages."));
    }
  }, [conversations, selfId]);

  const selectPartner = useCallback(
    (partnerId: string | null) => {
      setActivePartnerId(partnerId);
      if (!partnerId) return;

      const conversationId = conversationIdFor(selfId, partnerId);
      const alreadyLoaded = conversations[conversationId] !== undefined;

      if (!alreadyLoaded) {
        setConversations((previous) =>
          previous[conversationId]
            ? previous
            : { ...previous, [conversationId]: { ...EMPTY_CONVERSATION } },
        );
        void loadConversation(partnerId);
      }

      void markConversationRead(partnerId);
    },
    [conversations, loadConversation, markConversationRead, selfId],
  );

  // Keep the directory live: someone who signs up while this screen is open
  // should appear in the list without needing a reload. Profiles are readable
  // by every signed-in user, so these events reach everyone.
  useEffect(() => {
    let cancelled = false;
    let subscription: RealtimeSubscription | null = null;

    const handleProfileEvent = (event: RealtimeResponseEvent<ProfileRow>) => {
      const row = event.payload;
      if (!row?.userId || row.userId === selfId) return;

      const removed = event.events.some((name) => name.endsWith(".delete"));

      setProfiles((previous) => {
        if (removed) {
          return previous.filter((profile) => profile.userId !== row.userId);
        }
        const index = previous.findIndex((profile) => profile.userId === row.userId);
        const next = index === -1 ? [...previous, row] : previous.toSpliced(index, 1, row);
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
    };

    realtime
      .subscribe<ProfileRow>(profilesChannel(), handleProfileEvent)
      .then((created) => {
        if (cancelled) {
          void created.unsubscribe();
          return;
        }
        subscription = created;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      void subscription?.unsubscribe();
    };
  }, [selfId]);

  // One Realtime subscription for the whole screen. Rows carry per-row
  // permissions for exactly the two participants, so Appwrite only delivers
  // events for conversations this user is part of.
  useEffect(() => {
    let cancelled = false;
    let subscription: RealtimeSubscription | null = null;

    const handleEvent = (event: RealtimeResponseEvent<MessageRow>) => {
      const row = event.payload;
      if (!row?.conversationId) return;

      const isDelete = event.events.some((name) => name.endsWith(".delete"));
      const incoming = messageFromRow(row);

      if (isDelete) {
        setConversations((previous) => {
          const existing = previous[row.conversationId];
          if (!existing) return previous;
          return {
            ...previous,
            [row.conversationId]: {
              ...existing,
              messages: existing.messages.filter((message) => message.id !== row.$id),
            },
          };
        });
        return;
      }

      // Only cache conversations the user has opened; others are loaded on
      // demand and would otherwise show a partial history.
      setConversations((previous) => {
        const existing = previous[row.conversationId];
        if (!existing) return previous;
        return {
          ...previous,
          [row.conversationId]: {
            ...existing,
            messages: upsertMessage(existing.messages, incoming),
          },
        };
      });

      const isIncoming = row.recipientId === selfId;
      const activeConversation = activePartnerIdRef.current
        ? conversationIdFor(selfId, activePartnerIdRef.current)
        : null;
      const isForOpenConversation = row.conversationId === activeConversation;

      if (isIncoming && !row.read) {
        if (isForOpenConversation) {
          // Read immediately: the user is looking at this conversation.
          void tablesDB
            .updateRow<MessageRow>({
              databaseId: appwriteConfig.databaseId,
              tableId: appwriteConfig.messagesTableId,
              rowId: row.$id,
              data: { read: true },
            })
            .catch(() => undefined);
        } else {
          const isCreate = event.events.some((name) => name.endsWith(".create"));
          if (isCreate) {
            setUnreadByPartner((previous) => ({
              ...previous,
              [row.senderId]: (previous[row.senderId] ?? 0) + 1,
            }));
          }
        }
      }
    };

    realtime
      .subscribe<MessageRow>(messagesChannel(), handleEvent)
      .then((created) => {
        if (cancelled) {
          void created.unsubscribe();
          return;
        }
        subscription = created;
      })
      .catch(() => {
        if (!cancelled) {
          setError("Live updates are unavailable. Messages may be delayed.");
        }
      });

    return () => {
      cancelled = true;
      void subscription?.unsubscribe();
    };
  }, [selfId]);

  /** Writes one message row, carrying its optimistic UI entry to a final state. */
  const deliver = useCallback(
    async (messageId: string, body: string, recipientId: string) => {
      const conversationId = conversationIdFor(selfId, recipientId);

      const setStatus = (status: ChatMessage["status"]) => {
        setConversations((previous) => {
          const existing = previous[conversationId];
          if (!existing) return previous;
          return {
            ...previous,
            [conversationId]: {
              ...existing,
              messages: existing.messages.map((message) =>
                message.id === messageId ? { ...message, status } : message,
              ),
            },
          };
        });
      };

      try {
        await tablesDB.createRow<MessageRow>({
          databaseId: appwriteConfig.databaseId,
          tableId: appwriteConfig.messagesTableId,
          rowId: messageId,
          data: {
            conversationId,
            senderId: selfId,
            recipientId,
            senderName: selfName,
            body,
            read: false,
          },
          // Row-level permissions are the real access control for a one-to-one
          // conversation: only these two accounts can read it, only the
          // recipient can flip `read`, and only the sender can delete.
          permissions: [
            Permission.read(Role.user(selfId)),
            Permission.read(Role.user(recipientId)),
            Permission.update(Role.user(recipientId)),
            Permission.delete(Role.user(selfId)),
          ],
        });

        pendingBodies.current.delete(messageId);
        setStatus("sent");
      } catch (caught) {
        // A 409 means this exact row ID already exists — the first attempt did
        // reach Appwrite and only the response was lost, so this is a success.
        if (caught instanceof AppwriteException && caught.code === 409) {
          pendingBodies.current.delete(messageId);
          setStatus("sent");
          return;
        }
        setStatus("failed");
        setError(describeError(caught, "Message could not be sent."));
      }
    },
    [selfId, selfName],
  );

  const sendMessage = useCallback(
    async (rawBody: string) => {
      const partnerId = activePartnerIdRef.current;
      if (!partnerId) return;

      const body = rawBody.trim();
      const validationError = validateMessageBody(rawBody);
      if (validationError) {
        setError(validationError);
        return;
      }

      const conversationId = conversationIdFor(selfId, partnerId);
      // Generated up front so the optimistic entry and the Realtime echo of the
      // stored row share an ID and reconcile into one message.
      const messageId = ID.unique();

      const optimistic: ChatMessage = {
        id: messageId,
        conversationId,
        senderId: selfId,
        recipientId: partnerId,
        senderName: selfName,
        body,
        createdAt: new Date().toISOString(),
        read: false,
        status: "sending",
      };

      pendingBodies.current.set(messageId, { body, recipientId: partnerId });

      setConversations((previous) => {
        const existing = previous[conversationId] ?? {
          messages: [],
          hasMore: false,
          loading: false,
        };
        return {
          ...previous,
          [conversationId]: {
            ...existing,
            messages: upsertMessage(existing.messages, optimistic),
          },
        };
      });

      await deliver(messageId, body, partnerId);
    },
    [deliver, selfId, selfName],
  );

  const retryMessage = useCallback(
    async (messageId: string) => {
      const pending = pendingBodies.current.get(messageId);
      if (!pending) return;

      const conversationId = conversationIdFor(selfId, pending.recipientId);
      setConversations((previous) => {
        const existing = previous[conversationId];
        if (!existing) return previous;
        return {
          ...previous,
          [conversationId]: {
            ...existing,
            messages: existing.messages.map((message) =>
              message.id === messageId
                ? { ...message, status: "sending" as const }
                : message,
            ),
          },
        };
      });

      await deliver(messageId, pending.body, pending.recipientId);
    },
    [deliver, selfId],
  );

  const discardMessage = useCallback(
    (messageId: string) => {
      const pending = pendingBodies.current.get(messageId);
      if (!pending) return;

      const conversationId = conversationIdFor(selfId, pending.recipientId);
      pendingBodies.current.delete(messageId);

      setConversations((previous) => {
        const existing = previous[conversationId];
        if (!existing) return previous;
        return {
          ...previous,
          [conversationId]: {
            ...existing,
            messages: existing.messages.filter((message) => message.id !== messageId),
          },
        };
      });
    },
    [selfId],
  );

  const partners = useMemo<ChatPartner[]>(
    () =>
      profiles.map((profile) => ({
        userId: profile.userId,
        name: profile.name,
        email: profile.email,
        unreadCount: unreadByPartner[profile.userId] ?? 0,
      })),
    [profiles, unreadByPartner],
  );

  const activePartner = useMemo(
    () => partners.find((partner) => partner.userId === activePartnerId) ?? null,
    [partners, activePartnerId],
  );

  const activeConversation = activeConversationId
    ? (conversations[activeConversationId] ?? EMPTY_CONVERSATION)
    : { messages: [], hasMore: false, loading: false };

  const totalUnread = useMemo(
    () => Object.values(unreadByPartner).reduce((sum, count) => sum + count, 0),
    [unreadByPartner],
  );

  return {
    partners,
    partnersLoading,
    activePartner,
    activeConversation,
    totalUnread,
    error,
    dismissError: useCallback(() => setError(null), []),
    selectPartner,
    sendMessage,
    retryMessage,
    discardMessage,
    loadOlderMessages,
    refreshPartners: loadProfiles,
  };
}
