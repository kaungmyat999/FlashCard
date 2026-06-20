-- =============================================
-- FlashCard App - Supabase Database Schema
-- Multi-user model:
--   auth.users → blocks (1:N) → cards (1:N)
-- =============================================

-- 1. Blocks (vocabulary sets / decks) owned by a user
CREATE TABLE IF NOT EXISTS blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  block_type TEXT NOT NULL DEFAULT 'vocab',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Backfill for projects created before the vocab/notes block type was added.
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS block_type TEXT NOT NULL DEFAULT 'vocab';

-- 2. Cards (vocabulary flashcards within a block)
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  definition TEXT NOT NULL,
  example_sentence TEXT,
  interval INTEGER NOT NULL DEFAULT 1,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  repetitions INTEGER NOT NULL DEFAULT 0,
  due_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  state TEXT NOT NULL DEFAULT 'new',
  learning_step INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Backfill columns for projects created before the Anki scheduler was added.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'new';
ALTER TABLE cards ADD COLUMN IF NOT EXISTS learning_step INTEGER NOT NULL DEFAULT 0;
UPDATE cards SET state = 'review' WHERE repetitions > 0 AND state = 'new';

-- 3. Review history
CREATE TABLE IF NOT EXISTS review_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  quality INTEGER NOT NULL CHECK (quality BETWEEN 0 AND 5),
  old_interval INTEGER NOT NULL,
  new_interval INTEGER NOT NULL,
  old_ease_factor REAL NOT NULL,
  new_ease_factor REAL NOT NULL,
  reviewed_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blocks_user_id ON blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_block_id ON cards(block_id);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_due_date ON cards(due_date);
CREATE INDEX IF NOT EXISTS idx_review_history_user_id ON review_history(user_id);
CREATE INDEX IF NOT EXISTS idx_review_history_card_id ON review_history(card_id);

-- Row Level Security
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_history ENABLE ROW LEVEL SECURITY;

-- Owner-scoped policies (each authenticated user only sees their own rows)
DROP POLICY IF EXISTS "blocks_owner_select" ON blocks;
DROP POLICY IF EXISTS "blocks_owner_insert" ON blocks;
DROP POLICY IF EXISTS "blocks_owner_update" ON blocks;
DROP POLICY IF EXISTS "blocks_owner_delete" ON blocks;
CREATE POLICY "blocks_owner_select" ON blocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "blocks_owner_insert" ON blocks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "blocks_owner_update" ON blocks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "blocks_owner_delete" ON blocks FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "cards_owner_select" ON cards;
DROP POLICY IF EXISTS "cards_owner_insert" ON cards;
DROP POLICY IF EXISTS "cards_owner_update" ON cards;
DROP POLICY IF EXISTS "cards_owner_delete" ON cards;
CREATE POLICY "cards_owner_select" ON cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "cards_owner_insert" ON cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cards_owner_update" ON cards FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cards_owner_delete" ON cards FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "review_history_owner_select" ON review_history;
DROP POLICY IF EXISTS "review_history_owner_insert" ON review_history;
CREATE POLICY "review_history_owner_select" ON review_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "review_history_owner_insert" ON review_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_blocks_updated_at ON blocks;
CREATE TRIGGER trigger_blocks_updated_at
  BEFORE UPDATE ON blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_cards_updated_at ON cards;
CREATE TRIGGER trigger_cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
