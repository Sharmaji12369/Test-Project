"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ChatScreen } from "@/components/ChatScreen";
import { ConfigNotice } from "@/components/ConfigNotice";
import { FullPageSpinner } from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { isAppwriteConfigured } from "@/lib/env";

/**
 * The protected route. The Appwrite session lives in the browser (the client
 * SDK owns the session cookie on the Appwrite domain, not on this app's
 * domain), so the guard runs on the client: while the session is being
 * restored nothing renders, and a visitor without one is sent to /login.
 *
 * The real security boundary is Appwrite itself — every read and write is
 * authorised server-side by session and row permissions, so reaching this
 * page without a session still yields no data.
 */
export default function ChatPage() {
  const router = useRouter();
  const { user, initialising } = useAuth();

  useEffect(() => {
    if (!isAppwriteConfigured || initialising || user) return;
    router.replace("/login");
  }, [user, initialising, router]);

  if (!isAppwriteConfigured) return <ConfigNotice />;
  if (initialising) return <FullPageSpinner label="Checking your session…" />;
  if (!user) return <FullPageSpinner label="Redirecting to sign in…" />;

  return <ChatScreen user={user} />;
}
