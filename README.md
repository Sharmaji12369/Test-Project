# Pulse — Real-Time Chat

One-to-one real-time messaging built with **Next.js 16 + TypeScript + Tailwind CSS v4**, backed by
**Appwrite** (Auth, TablesDB and Realtime) and deployed on **Vercel**.

Sign up, pick someone from the list of registered users, and talk. Messages appear on both
screens as they are sent, conversations are private to their two participants, and history is
there when you come back.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Appwrite setup](#appwrite-setup)
  - [Option A — automated](#option-a--automated-recommended)
  - [Option B — manual](#option-b--manual-via-the-console)
  - [Register your web platforms](#register-your-web-platforms-required)
- [Environment variables](#environment-variables)
- [Running locally](#running-locally)
- [Deploying to Vercel](#deploying-to-vercel)
- [Testing with two users](#testing-with-two-users)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Scripts](#scripts)
- [Security notes](#security-notes)
- [Known limitations](#known-limitations)

---

## Features

**Core**

- Email/password sign-up, login and logout
- Protected `/chat` route
- A directory of all registered users
- One-to-one conversations, selected from that directory
- Every message carries its sender and recipient, and is readable only by those two accounts
- Switching between conversations, with history loaded on open
- The active conversation is clearly highlighted
- Live delivery over Appwrite Realtime — no polling, no refresh
- Messages persisted in Appwrite TablesDB
- Sender name and timestamp on every message
- Auto-scroll to the newest message
- Empty and whitespace-only messages are rejected
- Responsive layout: a single column on phones, two panes from `md` up
- All configuration through environment variables; no secrets in the repository

**Extras**

- **Unread indicator** — a per-conversation badge plus a total in the sidebar, cleared when the
  conversation is opened
- **Delivery states** — messages show *Sending…*, then a sent tick, then a double tick once read;
  a failed send turns red and offers **Retry** or **Discard**
- Day separators (Today / Yesterday / date) and read receipts
- "Load earlier messages" pagination, preserving scroll position
- Search over the user directory
- Light and dark themes, following the system setting
- A clear setup screen when environment variables are missing, instead of a blank page

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Auth / data / realtime | Appwrite (`appwrite` Web SDK v28) |
| Provisioning | `node-appwrite` v29 (local script only) |
| Hosting | Vercel |

---

## Quick start

```bash
git clone <your-repo-url>
cd <repo>
npm install

cp .env.example .env.local        # then fill it in — see Appwrite setup below

npm run setup                     # provision the Appwrite backend (one time)
npm run dev                       # http://localhost:3000
```

---

## Appwrite setup

1. Create a free account at [cloud.appwrite.io](https://cloud.appwrite.io) and start a new project.
2. On **Project overview**, copy the **Project ID** and the **API Endpoint**. The endpoint is
   region-specific — for example `https://fra.cloud.appwrite.io/v1` (Frankfurt),
   `https://nyc.cloud.appwrite.io/v1` (New York) or `https://syd.cloud.appwrite.io/v1` (Sydney).
   Use the one your project actually shows.
3. Email/password authentication is enabled by default. If you have changed it, re-enable it under
   **Auth → Settings → Email/Password**.
4. Create the database and tables with **Option A** or **Option B** below.

### Option A — automated (recommended)

Create an API key under **Overview → Integrations → API keys** (or **Settings → API keys**) with
these scopes:

```
databases.read   databases.write
tables.read      tables.write
collections.read collections.write
attributes.read  attributes.write
indexes.read     indexes.write
```

Put the endpoint, project ID and key in `.env.local` (copy `.env.example`), then run:

```bash
npm run setup
```

The script reads `.env.local`, so this works the same on macOS, Linux and Windows.
Shell variables take precedence if you would rather not put the key in a file:

```bash
# macOS / Linux
APPWRITE_PROJECT_ID="..." APPWRITE_API_KEY="..." npm run setup
```

```powershell
# Windows PowerShell — note that the bash "VAR=value command" form does not work here
$env:APPWRITE_PROJECT_ID = "..."
$env:APPWRITE_API_KEY = "..."
npm run setup
```

The script creates the database, both tables, every column and index, and sets the permissions
described below. It is idempotent — re-running it reports what already exists and changes nothing.
It prints the environment variables to copy when it finishes.

The API key is read from the environment, is never written to disk, and is **not** used by the web
app. Once setup has run you can delete the key.

### Option B — manual (via the console)

Create a database with ID `chat`, then two tables.

**Table `profiles`** — the directory of registered users.

| Column | Type | Size | Required |
| --- | --- | --- | --- |
| `userId` | String | 36 | yes |
| `name` | String | 128 | yes |
| `email` | String | 256 | yes |

- Indexes: `idx_userId` (unique, `userId`), `idx_name` (key, `name` ASC)
- Permissions: **Read — All users**, **Create — All users**
- **Enable row (document) security**, so each profile can only be edited by its owner

**Table `messages`**

| Column | Type | Size | Required | Default |
| --- | --- | --- | --- | --- |
| `conversationId` | String | 100 | yes | — |
| `senderId` | String | 36 | yes | — |
| `recipientId` | String | 36 | yes | — |
| `senderName` | String | 128 | yes | — |
| `body` | String | 5000 | yes | — |
| `read` | Boolean | — | no | `false` |

- Indexes:
  - `idx_conversation` (key, `conversationId` ASC)
  - `idx_inbox_unread` (key, `recipientId` ASC, `read` ASC)
  - `idx_conversation_unread` (key, `conversationId` ASC, `recipientId` ASC, `read` ASC)
- Permissions: **Create — All users** only. Do **not** grant table-level read.
- **Enable row (document) security** — this is what keeps conversations private.

Reading a message is governed entirely by per-row permissions, which the app sets when it writes
each row. See [How it works](#how-it-works).

### Register your web platforms (required)

Appwrite rejects browser requests from origins it does not know, so this step is not optional —
without it the deployed app fails with CORS errors.

Under **Overview → Platforms → Add platform → Web app**, add:

| Name | Hostname |
| --- | --- |
| Local | `localhost` |
| Vercel | `your-project.vercel.app` |

Add the hostname only — no `https://`, no trailing slash. If you use Vercel preview deployments,
add `*.vercel.app` as well so preview URLs work too.

---

## Environment variables

Copy `.env.example` to `.env.local` and fill it in.

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_APPWRITE_ENDPOINT` | yes | Your region's API endpoint |
| `NEXT_PUBLIC_APPWRITE_PROJECT_ID` | yes | Project ID from the overview page |
| `NEXT_PUBLIC_APPWRITE_DATABASE_ID` | yes | `chat` by default |
| `NEXT_PUBLIC_APPWRITE_PROFILES_TABLE_ID` | no | Defaults to `profiles` |
| `NEXT_PUBLIC_APPWRITE_MESSAGES_TABLE_ID` | no | Defaults to `messages` |
| `APPWRITE_ENDPOINT` | setup only | Same endpoint, read by `npm run setup` |
| `APPWRITE_PROJECT_ID` | setup only | Same project ID, read by `npm run setup` |
| `APPWRITE_API_KEY` | setup only | **Secret.** Used by `npm run setup`, never by the app. Delete the key once setup has run |

`NEXT_PUBLIC_*` values are embedded in the browser bundle. That is correct and expected: an
endpoint, a project ID and table IDs are public identifiers, and Appwrite authorises every request
by session and row permissions rather than by keeping those IDs secret. The API key is the only
real secret, and it never leaves your machine.

If a required variable is missing the app renders a setup screen naming it, rather than failing
with an opaque network error.

---

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Other checks:

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # unit tests for the conversation logic
npm run build      # production build
```

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel, **Add New → Project** and import it. The framework is detected automatically; the
   default build command and output settings are correct.
3. Under **Settings → Environment Variables**, add every `NEXT_PUBLIC_*` variable from your
   `.env.local` for the Production, Preview and Development environments. **Do not add
   `APPWRITE_API_KEY`** — the app does not use it.
4. Deploy.
5. Copy the deployment hostname (`your-project.vercel.app`) and add it as a **Web platform** in the
   Appwrite console, as described [above](#register-your-web-platforms-required).
6. Reload the deployed app.

> If you add the environment variables after the first deploy, redeploy — `NEXT_PUBLIC_*` values are
> inlined at build time, so an existing build will not pick them up.

---

## Testing with two users

Each browser profile holds its own Appwrite session, so two sessions need two profiles:

1. Open the app in a normal window and sign up as the first user.
2. Open a **private/incognito window** (or a different browser) and sign up as the second.
3. In each window, pick the other person from the list.
4. Send a message from one side — it appears on the other within a moment, with no refresh.
5. Switch the second user to a different conversation and send again: the badge on the first
   conversation increments, and clears when that conversation is opened.

Two tabs in the *same* profile share one session and will both be logged in as the same user.

---

## How it works

### Conversation addressing

A conversation ID is the two user IDs sorted and joined: `conversationIdFor(a, b)` returns the same
value for both participants. One equality query fetches a whole conversation, and neither side has
to look up a conversation record first.

### Message privacy

The `messages` table grants only `create` at table level. Everything else is per-row: when a message
is written, the app attaches

```ts
Permission.read(Role.user(senderId)),
Permission.read(Role.user(recipientId)),
Permission.update(Role.user(recipientId)),   // so the recipient can mark it read
Permission.delete(Role.user(senderId))
```

So a conversation is private at the API layer, not merely filtered in the UI. Appwrite will not
return another pair's messages however the client queries, and Realtime only delivers events for
rows the connected user is allowed to read.

### Listing registered users

The client SDK cannot list a project's auth users — that needs a server API key, which has no place
in a browser. The app therefore keeps its own `profiles` table, written on sign-up and re-synced on
every login, so a profile that failed to save once repairs itself on the next sign-in.

### Realtime and optimistic sending

The chat screen opens **one** Realtime subscription to the messages table for its lifetime; the
handler reads current state through refs so the socket never has to be torn down and reopened.
Row permissions mean this single subscription only ever receives this user's messages.

Sending is optimistic. The row ID is generated client-side with `ID.unique()` *before* the write, so
the optimistic bubble and the Realtime echo of the stored row share an ID and reconcile into one
message instead of appearing twice. A failed write marks the bubble *Not sent* and offers Retry,
which reuses the same ID — if the first attempt actually reached Appwrite and only the response was
lost, the retry returns a 409 and is treated as success rather than duplicating the message.

### Auto-scroll

The view follows new messages while you are at the bottom, and always when you send. If you have
scrolled up to read history it stays put and offers a "Jump to latest" button, so an incoming
message never yanks you away mid-sentence.

---

## Project structure

```
scripts/
  setup-appwrite.mjs      Provisions database, tables, columns, indexes, permissions
src/
  app/
    layout.tsx            Root layout, fonts, AuthProvider
    page.tsx              Entry point; redirects by session state
    login/, signup/       Auth pages
    chat/page.tsx         The protected chat route
  components/
    AuthForm.tsx          Shared login/signup form
    ChatScreen.tsx        Sidebar + conversation layout
    PartnerList.tsx       User directory, search, unread badges
    ConversationPanel.tsx Message list, auto-scroll, pagination
    MessageBubble.tsx     One message, with delivery state
    MessageComposer.tsx   Input, validation, Enter-to-send
    Avatar.tsx, Spinner.tsx, ConfigNotice.tsx
  context/
    AuthContext.tsx       Session state, sign-up/in/out, profile sync
  hooks/
    useChat.ts            Directory, conversations, Realtime, sending, unread
  lib/
    appwrite.ts           Client and services
    chat.ts               Conversation IDs, sorting, formatting, validation
    env.ts                Public configuration and missing-variable detection
    types.ts              Row and message types
tests/
  chat.test.mjs           Unit tests for the conversation logic
```

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit tests for the conversation logic |
| `npm run setup` | Provision the Appwrite backend |

---

## Security notes

- No secret is committed. `.gitignore` excludes `.env*` while allowing `.env.example`.
- The Appwrite API key is used only by `npm run setup`, is read from the environment, and is not
  referenced anywhere under `src/`.
- Authorisation is enforced by Appwrite, not by the UI: per-row permissions scope every message to
  its two participants, for queries and for Realtime alike.
- The `/chat` guard runs on the client, because the Appwrite session cookie belongs to the Appwrite
  domain rather than this app's. Reaching the route without a session therefore shows nothing and
  redirects — and would return no data in any case, since every request is authorised server-side.

---

## Known limitations

Honest notes on where this stops, and what each would take to finish.

- **The recipient can update a message row.** Appwrite's row permissions are per-operation, not
  per-column, so granting the recipient `update` so they can set `read` also lets them write other
  fields. A hostile client could edit a received message's text in the database. Closing this
  properly means moving the read-receipt write into an Appwrite Function that validates the change
  server-side, and dropping `update` from the row's permissions.
- **No server-side route protection.** The session lives in the browser with the client SDK, so
  `/chat` is guarded on the client. Server-side guarding would mean issuing an Appwrite JWT, storing
  it in a first-party cookie, and checking it in middleware.
- **The user directory is capped at 200 people** and the unread scan at 500 messages — fine at this
  scale, but both want cursor pagination to grow.
- **Unread badges only count messages addressed to you** that arrive while the app is open or were
  unread at load. They are not aggregated server-side.
- **No presence, typing indicators, attachments, group chats, or message editing/deletion in the
  UI.** The schema would support delete; the rest are out of scope.
- **Realtime reconnection is the SDK's.** If the socket drops, the app shows a banner and the SDK
  retries; messages sent while disconnected are not back-filled until the conversation is reopened.
- **`npm audit` reports advisories in the ESLint toolchain** (`braces` via
  `eslint-config-next`). They affect a development dependency only, not the deployed app, and the
  only published fix is a major downgrade of `eslint-config-next`.
