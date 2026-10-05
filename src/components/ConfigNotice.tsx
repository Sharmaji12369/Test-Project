import { missingEnvVars } from "@/lib/env";

/**
 * Shown instead of the app when required environment variables are absent.
 * Without this, a misconfigured deployment fails with an opaque network error.
 */
export function ConfigNotice() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-lg rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
        <h1 className="text-lg font-semibold">Appwrite is not configured</h1>
        <p className="mt-2 text-sm">
          These environment variables are missing, so the app cannot reach Appwrite:
        </p>
        <ul className="mt-3 space-y-1 font-mono text-sm">
          {missingEnvVars.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm">
          Copy <code className="font-mono">.env.example</code> to{" "}
          <code className="font-mono">.env.local</code>, fill it in, and restart the dev
          server. On Vercel, add them under Project Settings → Environment Variables and
          redeploy. See the README for the full setup.
        </p>
      </div>
    </main>
  );
}
