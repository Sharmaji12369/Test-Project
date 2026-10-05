"use client";

import { AuthForm } from "@/components/AuthForm";
import { ConfigNotice } from "@/components/ConfigNotice";
import { isAppwriteConfigured } from "@/lib/env";

export default function LoginPage() {
  if (!isAppwriteConfigured) return <ConfigNotice />;
  return <AuthForm mode="login" />;
}
