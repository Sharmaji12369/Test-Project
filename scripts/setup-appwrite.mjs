#!/usr/bin/env node
/**
 * Provisions the Appwrite backend this app expects: one database, a `profiles`
 * table and a `messages` table, with the columns, indexes and permissions
 * described in the README.
 *
 * Run it once, from your machine, after creating an Appwrite project:
 *
 *   APPWRITE_ENDPOINT="https://fra.cloud.appwrite.io/v1" \
 *   APPWRITE_PROJECT_ID="..." \
 *   APPWRITE_API_KEY="..." \
 *   npm run setup
 *
 * The API key is a secret. It is read from the environment, is never written to
 * disk by this script, and is not referenced anywhere under `src/` — the browser
 * app authenticates as the logged-in user, never with an API key.
 *
 * Re-running is safe: anything that already exists is reported and skipped.
 */

import {
  Client,
  IndexStatus,
  OrderBy,
  Permission,
  Role,
  TablesDB,
  TablesDBIndexType,
} from "node-appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT?.trim();
const projectId = process.env.APPWRITE_PROJECT_ID?.trim();
const apiKey = process.env.APPWRITE_API_KEY?.trim();

const databaseId = process.env.APPWRITE_DATABASE_ID?.trim() || "chat";
const profilesTableId = process.env.APPWRITE_PROFILES_TABLE_ID?.trim() || "profiles";
const messagesTableId = process.env.APPWRITE_MESSAGES_TABLE_ID?.trim() || "messages";

if (!endpoint || !projectId || !apiKey) {
  console.error(
    "Missing configuration. Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and " +
      "APPWRITE_API_KEY before running this script.\n\n" +
      "The API key needs the scopes: databases.read, databases.write, " +
      "tables.read, tables.write, collections.read, collections.write, " +
      "attributes.read, attributes.write, indexes.read, indexes.write.",
  );
  process.exit(1);
}

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const tablesDB = new TablesDB(client);

const log = (message) => console.log(`  ${message}`);
const ALREADY_EXISTS = 409;

/** Runs a creation step, treating "already exists" as success. */
async function ensure(label, create) {
  try {
    await create();
    log(`created  ${label}`);
  } catch (error) {
    if (error?.code === ALREADY_EXISTS) {
      log(`exists   ${label}`);
      return;
    }
    throw error;
  }
}

/**
 * Appwrite provisions columns asynchronously. An index over a column that is
 * still `processing` fails, so wait for the whole table to settle first.
 */
async function waitForColumns(tableId, { timeoutMs = 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { columns } = await tablesDB.listColumns({ databaseId, tableId });
    const pending = columns.filter((column) => column.status !== IndexStatus.Available);

    if (pending.length === 0) return;

    const broken = pending.filter((column) =>
      [IndexStatus.Stuck, IndexStatus.Failed].includes(column.status),
    );
    if (broken.length > 0) {
      throw new Error(
        `Columns failed to provision on "${tableId}": ` +
          broken.map((column) => `${column.key} (${column.status})`).join(", "),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for columns on "${tableId}" to become available.`);
}

async function main() {
  console.log(`\nAppwrite setup → ${endpoint} (project ${projectId})\n`);

  console.log("Database");
  await ensure(`database "${databaseId}"`, () =>
    tablesDB.create({ databaseId, name: "Chat" }),
  );

  // --- profiles -------------------------------------------------------------
  // A directory of registered users. The client SDK cannot list a project's
  // auth users (that needs an API key), so the app maintains this itself and
  // every signed-in user may read it.
  console.log("\nTable: profiles");
  await ensure(`table "${profilesTableId}"`, () =>
    tablesDB.createTable({
      databaseId,
      tableId: profilesTableId,
      name: "Profiles",
      permissions: [Permission.read(Role.users()), Permission.create(Role.users())],
      // Each row additionally carries owner permissions, so a user can only
      // update or delete their own profile.
      rowSecurity: true,
    }),
  );

  await ensure("column userId", () =>
    tablesDB.createStringColumn({
      databaseId,
      tableId: profilesTableId,
      key: "userId",
      size: 36,
      required: true,
    }),
  );
  await ensure("column name", () =>
    tablesDB.createStringColumn({
      databaseId,
      tableId: profilesTableId,
      key: "name",
      size: 128,
      required: true,
    }),
  );
  await ensure("column email", () =>
    tablesDB.createStringColumn({
      databaseId,
      tableId: profilesTableId,
      key: "email",
      size: 256,
      required: true,
    }),
  );

  log("waiting for columns to become available…");
  await waitForColumns(profilesTableId);

  await ensure("index userId (unique)", () =>
    tablesDB.createIndex({
      databaseId,
      tableId: profilesTableId,
      key: "idx_userId",
      type: TablesDBIndexType.Unique,
      columns: ["userId"],
    }),
  );
  await ensure("index name", () =>
    tablesDB.createIndex({
      databaseId,
      tableId: profilesTableId,
      key: "idx_name",
      type: TablesDBIndexType.Key,
      columns: ["name"],
      orders: [OrderBy.Asc],
    }),
  );

  // --- messages -------------------------------------------------------------
  // Only `create` is granted at table level. Reading is governed entirely by
  // per-row permissions, which the app sets to exactly the two participants, so
  // a conversation is private at the API layer and over Realtime — not merely
  // filtered in the UI.
  console.log("\nTable: messages");
  await ensure(`table "${messagesTableId}"`, () =>
    tablesDB.createTable({
      databaseId,
      tableId: messagesTableId,
      name: "Messages",
      permissions: [Permission.create(Role.users())],
      rowSecurity: true,
    }),
  );

  const messageColumns = [
    { key: "conversationId", size: 100 },
    { key: "senderId", size: 36 },
    { key: "recipientId", size: 36 },
    { key: "senderName", size: 128 },
    { key: "body", size: 5000 },
  ];

  for (const { key, size } of messageColumns) {
    await ensure(`column ${key}`, () =>
      tablesDB.createStringColumn({
        databaseId,
        tableId: messagesTableId,
        key,
        size,
        required: true,
      }),
    );
  }

  await ensure("column read", () =>
    tablesDB.createBooleanColumn({
      databaseId,
      tableId: messagesTableId,
      key: "read",
      // Optional with a default, so existing rows stay valid and new rows start unread.
      required: false,
      xdefault: false,
    }),
  );

  log("waiting for columns to become available…");
  await waitForColumns(messagesTableId);

  // Serves the main read path: one conversation, newest first.
  await ensure("index conversationId", () =>
    tablesDB.createIndex({
      databaseId,
      tableId: messagesTableId,
      key: "idx_conversation",
      type: TablesDBIndexType.Key,
      columns: ["conversationId"],
      orders: [OrderBy.Asc],
    }),
  );
  // Serves the unread badge counts.
  await ensure("index recipientId + read", () =>
    tablesDB.createIndex({
      databaseId,
      tableId: messagesTableId,
      key: "idx_inbox_unread",
      type: TablesDBIndexType.Key,
      columns: ["recipientId", "read"],
      orders: [OrderBy.Asc, OrderBy.Asc],
    }),
  );
  // Serves marking a single conversation as read.
  await ensure("index conversationId + recipientId + read", () =>
    tablesDB.createIndex({
      databaseId,
      tableId: messagesTableId,
      key: "idx_conversation_unread",
      type: TablesDBIndexType.Key,
      columns: ["conversationId", "recipientId", "read"],
      orders: [OrderBy.Asc, OrderBy.Asc, OrderBy.Asc],
    }),
  );

  console.log("\nDone. Add these to .env.local and to your Vercel project:\n");
  console.log(`  NEXT_PUBLIC_APPWRITE_ENDPOINT=${endpoint}`);
  console.log(`  NEXT_PUBLIC_APPWRITE_PROJECT_ID=${projectId}`);
  console.log(`  NEXT_PUBLIC_APPWRITE_DATABASE_ID=${databaseId}`);
  console.log(`  NEXT_PUBLIC_APPWRITE_PROFILES_TABLE_ID=${profilesTableId}`);
  console.log(`  NEXT_PUBLIC_APPWRITE_MESSAGES_TABLE_ID=${messagesTableId}\n`);
  console.log(
    "Remember to add your Vercel domain as a Web platform in the Appwrite console\n" +
      "(Overview → Platforms), or the browser will be blocked by CORS.\n",
  );
}

main().catch((error) => {
  console.error(`\nSetup failed: ${error?.message ?? error}`);
  if (error?.response) console.error(error.response);
  process.exit(1);
});
