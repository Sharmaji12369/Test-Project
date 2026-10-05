"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { ConfigNotice } from "@/components/ConfigNotice";
import { FullPageSpinner } from "@/components/Spinner";
import { useAuth } from "@/context/AuthContext";
import { isAppwriteConfigured } from "@/lib/env";

/** Entry point: sends you to the chat if signed in, to the login page if not. */
export default function HomePage() {
  const router = useRouter();
  const { user, initialising } = useAuth();

  useEffect(() => {
    if (!isAppwriteConfigured || initialising) return;
    router.replace(user ? "/chat" : "/login");
  }, [user, initialising, router]);

  if (!isAppwriteConfigured) return <ConfigNotice />;
  return <FullPageSpinner label="Starting…" />;
}
