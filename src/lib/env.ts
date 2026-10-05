/**
 * Public Appwrite configuration.
 *
 * Every value here is read from a `NEXT_PUBLIC_*` environment variable, so it is
 * inlined into the client bundle at build time. That is correct and safe for
 * these values — an Appwrite endpoint, project ID, database ID and table IDs are
 * public identifiers, and Appwrite enforces access with sessions + permissions,
 * not with secrecy. The Appwrite **API key** is a secret and is therefore never
 * referenced anywhere in `src/` — it is only used by `scripts/setup-appwrite.mjs`,
 * which runs on your machine.
 *
 * `process.env.NEXT_PUBLIC_*` must be written out literally for Next.js to
 * replace it at build time, which is why these are not read through a loop.
 */

const DEFAULT_ENDPOINT = "https://fra.cloud.appwrite.io/v1";

export const appwriteConfig = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT?.trim() || DEFAULT_ENDPOINT,
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID?.trim() || "",
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID?.trim() || "",
  profilesTableId:
    process.env.NEXT_PUBLIC_APPWRITE_PROFILES_TABLE_ID?.trim() || "profiles",
  messagesTableId:
    process.env.NEXT_PUBLIC_APPWRITE_MESSAGES_TABLE_ID?.trim() || "messages",
} as const;

/**
 * Variables without a usable default. The UI surfaces these instead of throwing,
 * so a misconfigured deployment shows an actionable message rather than a blank
 * screen or an opaque network error.
 */
export const missingEnvVars: string[] = [
  ...(appwriteConfig.projectId ? [] : ["NEXT_PUBLIC_APPWRITE_PROJECT_ID"]),
  ...(appwriteConfig.databaseId ? [] : ["NEXT_PUBLIC_APPWRITE_DATABASE_ID"]),
];

export const isAppwriteConfigured = missingEnvVars.length === 0;
