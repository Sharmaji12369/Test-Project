"use client";

import { ID, type Models } from "appwrite";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { account, describeError, tablesDB } from "@/lib/appwrite";
import { appwriteConfig, isAppwriteConfigured } from "@/lib/env";
import type { ProfileRow } from "@/lib/types";

type AuthUser = Models.User<Models.DefaultPreferences>;

type AuthContextValue = {
  user: AuthUser | null;
  /** True until the initial session check has finished. */
  initialising: boolean;
  signUp: (input: { name: string; email: string; password: string }) => Promise<void>;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Mirrors the logged-in account into the `profiles` table.
 *
 * The client SDK deliberately cannot list a project's auth users (that needs a
 * server API key), so the app keeps its own directory of registered users. The
 * row ID is the account ID, which makes this an idempotent upsert and keeps the
 * directory self-healing: if the write failed during sign-up, the next sign-in
 * repairs it.
 */
async function syncProfile(user: AuthUser): Promise<void> {
  await tablesDB.upsertRow<ProfileRow>({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.profilesTableId,
    rowId: user.$id,
    data: {
      userId: user.$id,
      name: user.name || user.email,
      email: user.email,
    },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Starts false when Appwrite is unconfigured: there is no session to restore.
  const [initialising, setInitialising] = useState(isAppwriteConfigured);

  // Restore an existing Appwrite session on first load. A 401 here is the
  // normal "not logged in" case, not an error worth surfacing.
  useEffect(() => {
    let cancelled = false;

    if (!isAppwriteConfigured) return;

    account
      .get()
      .then((current) => {
        if (cancelled) return;
        setUser(current);
        // Best effort: never block sign-in on directory repair.
        void syncProfile(current).catch(() => undefined);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signUp = useCallback(
    async ({ name, email, password }: { name: string; email: string; password: string }) => {
      await account.create({ userId: ID.unique(), email, password, name });
      await account.createEmailPasswordSession({ email, password });

      const current = await account.get();
      try {
        await syncProfile(current);
      } catch (error) {
        // The account exists and the session is live, so let the user in; they
        // simply will not be listed for others until a later sync succeeds.
        console.error(describeError(error, "Could not save your profile."));
      }
      setUser(current);
    },
    [],
  );

  const signIn = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      await account.createEmailPasswordSession({ email, password });
      const current = await account.get();
      void syncProfile(current).catch(() => undefined);
      setUser(current);
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await account.deleteSession({ sessionId: "current" });
    } finally {
      // Clear locally even if the network call failed — the user asked to leave.
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, initialising, signUp, signIn, signOut }),
    [user, initialising, signUp, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an <AuthProvider>.");
  return context;
}
