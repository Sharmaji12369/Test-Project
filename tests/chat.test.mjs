/**
 * Tests for the pure conversation logic. These cover the rules the UI depends
 * on: that both participants derive the same conversation ID, that optimistic
 * messages reconcile with the Realtime echo instead of duplicating, and that
 * empty messages are rejected.
 *
 * Run with `npm test`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
// Load the TypeScript sources directly via Node's built-in type stripping.
const {
  conversationIdFor,
  partnerIdFrom,
  upsertMessage,
  sortByCreatedAt,
  initialsOf,
  isNewDay,
  validateMessageBody,
  MAX_MESSAGE_LENGTH,
} = await import("../src/lib/chat.ts");

const message = (overrides = {}) => ({
  id: "m1",
  conversationId: "a_b",
  senderId: "a",
  recipientId: "b",
  senderName: "Ada",
  body: "hello",
  createdAt: "2026-01-01T10:00:00.000Z",
  read: false,
  status: "sent",
  ...overrides,
});

test("both participants derive the same conversation ID", () => {
  assert.equal(conversationIdFor("alice", "bob"), conversationIdFor("bob", "alice"));
});

test("conversation IDs are distinct per pair", () => {
  assert.notEqual(conversationIdFor("alice", "bob"), conversationIdFor("alice", "carol"));
});

test("a conversation with yourself is stable", () => {
  assert.equal(conversationIdFor("alice", "alice"), "alice_alice");
});

test("partnerIdFrom returns the other participant", () => {
  const id = conversationIdFor("alice", "bob");
  assert.equal(partnerIdFrom(id, "alice"), "bob");
  assert.equal(partnerIdFrom(id, "bob"), "alice");
});

test("partnerIdFrom rejects a conversation you are not part of", () => {
  assert.equal(partnerIdFrom(conversationIdFor("alice", "bob"), "carol"), null);
});

test("the Realtime echo of an optimistic message does not duplicate it", () => {
  // The client generates the row ID up front, so the optimistic entry and the
  // stored row that comes back over Realtime share an ID.
  const optimistic = message({ id: "row-1", status: "sending" });
  const echoed = message({ id: "row-1", status: "sent" });

  const afterSend = upsertMessage([], optimistic);
  const afterEcho = upsertMessage(afterSend, echoed);

  assert.equal(afterEcho.length, 1, "expected one message, not a duplicate");
  assert.equal(afterEcho[0].status, "sent");
});

test("a distinct message is appended rather than merged", () => {
  const first = message({ id: "row-1" });
  const second = message({ id: "row-2", createdAt: "2026-01-01T10:00:01.000Z" });

  const result = upsertMessage(upsertMessage([], first), second);
  assert.deepEqual(
    result.map((entry) => entry.id),
    ["row-1", "row-2"],
  );
});

test("out-of-order arrivals are sorted oldest first", () => {
  const later = message({ id: "row-2", createdAt: "2026-01-01T12:00:00.000Z" });
  const earlier = message({ id: "row-1", createdAt: "2026-01-01T09:00:00.000Z" });

  const result = upsertMessage(upsertMessage([], later), earlier);
  assert.deepEqual(
    result.map((entry) => entry.id),
    ["row-1", "row-2"],
  );
});

test("messages sent in the same millisecond keep a stable order", () => {
  const a = message({ id: "aaa", createdAt: "2026-01-01T10:00:00.000Z" });
  const b = message({ id: "bbb", createdAt: "2026-01-01T10:00:00.000Z" });

  assert.deepEqual(
    sortByCreatedAt([b, a]).map((entry) => entry.id),
    sortByCreatedAt([a, b]).map((entry) => entry.id),
  );
});

test("empty and whitespace-only messages are rejected", () => {
  assert.ok(validateMessageBody(""));
  assert.ok(validateMessageBody("   "));
  assert.ok(validateMessageBody("\n\t  \n"));
});

test("a message with content is accepted", () => {
  assert.equal(validateMessageBody("hi"), null);
  assert.equal(validateMessageBody("  padded  "), null);
});

test("over-long messages are rejected", () => {
  assert.equal(validateMessageBody("x".repeat(MAX_MESSAGE_LENGTH)), null);
  assert.ok(validateMessageBody("x".repeat(MAX_MESSAGE_LENGTH + 1)));
});

test("initials come from the first and last name", () => {
  assert.equal(initialsOf("Ada Lovelace"), "AL");
  assert.equal(initialsOf("Ada Byron Lovelace"), "AL");
  assert.equal(initialsOf("Ada"), "AD");
  assert.equal(initialsOf("  spaced   out  "), "SO");
  assert.equal(initialsOf(""), "?");
});

test("day separators appear only when the calendar day changes", () => {
  assert.equal(isNewDay(undefined, "2026-01-01T10:00:00.000Z"), true);
  assert.equal(
    isNewDay("2026-01-01T10:00:00.000Z", "2026-01-01T23:00:00.000Z"),
    false,
  );
  assert.equal(
    isNewDay("2026-01-01T10:00:00.000Z", "2026-01-02T10:00:00.000Z"),
    true,
  );
});
