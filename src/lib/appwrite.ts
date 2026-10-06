import {
  Account,
  AppwriteException,
  Channel,
  Client,
  Realtime,
  TablesDB,
} from "appwrite";

import { appwriteConfig } from "./env";

/**
 * A single Client instance is shared by every service. Appwrite stores the
 * session in the browser, so all services created from this client are
 * automatically authenticated once the user logs in.
 */
const client = new Client()
  .setEndpoint(appwriteConfig.endpoint)
  .setProject(appwriteConfig.projectId || "unconfigured");

export const account = new Account(client);
export const tablesDB = new TablesDB(client);
export const realtime = new Realtime(client);

/**
 * Realtime channel carrying every row event on the messages table.
 *
 * Built on demand rather than at module scope: the Channel builder rejects an
 * empty ID, and this module is evaluated during the production build, when the
 * environment variables may not be present yet.
 */
export function messagesChannel(): string {
  return Channel.tablesdb(appwriteConfig.databaseId)
    .table(appwriteConfig.messagesTableId)
    .row()
    .toString();
}

/**
 * Realtime channel for the user directory, so a person who signs up while you
 * already have the app open appears in your list without a reload.
 */
export function profilesChannel(): string {
  return Channel.tablesdb(appwriteConfig.databaseId)
    .table(appwriteConfig.profilesTableId)
    .row()
    .toString();
}

/**
 * Turns an unknown thrown value into a message worth showing a user.
 *
 * Deliberately not auth-specific: a 401 from a message write means the table's
 * permissions reject the action, which is a completely different problem from a
 * bad password. Sign-in has its own mapping below.
 */
export function describeError(error: unknown, fallback: string): string {
  if (error instanceof AppwriteException) {
    if (error.code === 401) {
      return (
        "Appwrite refused the request. Your session may have expired, or the " +
        "table's permissions do not allow it — check that the messages table " +
        "grants Create to all users."
      );
    }
    if (error.code === 404) {
      return (
        "Appwrite could not find that database or table. Check the database " +
        "and table IDs in your environment variables."
      );
    }
    if (error.code === 429) return "Too many requests. Please wait a moment and try again.";
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Sign-in and sign-up, where a 401 really does mean bad credentials. */
export function describeAuthError(error: unknown, mode: "login" | "signup"): string {
  if (error instanceof AppwriteException) {
    if (error.code === 401) return "Incorrect email or password.";
    if (error.code === 409) return "An account with this email already exists.";
    if (error.code === 429) return "Too many attempts. Please wait and try again.";
  }
  return describeError(
    error,
    mode === "signup" ? "Could not sign you up." : "Could not sign you in.",
  );
}

export { AppwriteException };
