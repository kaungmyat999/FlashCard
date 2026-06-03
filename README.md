# FlashCard

Anki-style spaced repetition flashcard app. Organize vocabulary into decks, study with the SM-2 scheduler, and generate AI example sentences via Google Gemini.

## Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/flashcard.git
cd flashcard
npm install
```

### 2. Create `.env.local`

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Get these from your Supabase project under **Settings → API**.

### 3. Run the schema

Open the Supabase SQL editor and run [`supabase_schema.sql`](./supabase_schema.sql).

### 4. Start

```bash
npm run dev
```

---

## Swapping out Supabase

To replace Supabase with a different backend, change these four files:

| File | What to replace |
|---|---|
| `src/lib/supabase.ts` | Export your own client (or `null`). The app checks `isSupabaseConfigured` before any DB call. |
| `src/utils/db.ts` | All database functions — `fetchBlocks`, `insertCard`, `updateCardScheduling`, etc. Keep the same function signatures. |
| `src/hooks/useAuth.ts` | Swap the Supabase auth calls for your own provider. |
| `.env.local` | Remove or replace the `VITE_SUPABASE_*` vars with whatever your new backend needs. |

Everything else (scheduler, Gemini integration, UI) is fully decoupled and needs no changes.
