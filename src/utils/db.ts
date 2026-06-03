import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Card, CardState } from '../types';

// ─────────────────────────────────────────────
// Types mirroring Supabase table rows
// ─────────────────────────────────────────────

export interface DbBlock {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbCard {
  id: string;
  block_id: string;
  user_id: string;
  word: string;
  definition: string;
  example_sentence: string | null;
  interval: number;
  ease_factor: number;
  repetitions: number;
  due_date: string;
  state: string;
  learning_step: number;
  created_at: string;
  updated_at: string;
}

export interface DbReviewHistory {
  id: string;
  card_id: string;
  user_id: string;
  word: string;
  quality: number;
  old_interval: number;
  new_interval: number;
  old_ease_factor: number;
  new_ease_factor: number;
  reviewed_at: string;
}

// ─────────────────────────────────────────────
// Helpers: convert between DB rows and app Card
// ─────────────────────────────────────────────

export function dbCardToCard(row: DbCard): Card {
  return {
    id: row.id,
    word: row.word,
    definition: row.definition,
    exampleSentence: row.example_sentence,
    interval: row.interval,
    easeFactor: row.ease_factor,
    repetitions: row.repetitions,
    dueDate: row.due_date,
    createdAt: row.created_at,
    state: (row.state as CardState) ?? 'new',
    learningStep: row.learning_step ?? 0,
  };
}

function cardToDbRow(card: Card, blockId: string, userId: string) {
  return {
    id: card.id,
    block_id: blockId,
    user_id: userId,
    word: card.word,
    definition: card.definition,
    example_sentence: card.exampleSentence,
    interval: card.interval,
    ease_factor: card.easeFactor,
    repetitions: card.repetitions,
    due_date: card.dueDate,
    state: card.state,
    learning_step: card.learningStep,
  };
}

function ensureClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

// ─────────────────────────────────────────────
// BLOCK operations (user-scoped via RLS)
// ─────────────────────────────────────────────

export async function fetchBlocks(): Promise<DbBlock[]> {
  const client = ensureClient();
  const { data, error } = await client
    .from('blocks')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createBlock(
  userId: string,
  name: string,
  description?: string
): Promise<DbBlock> {
  const client = ensureClient();
  const { data, error } = await client
    .from('blocks')
    .insert({ user_id: userId, name, description: description ?? '' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBlock(
  blockId: string,
  updates: Partial<Pick<DbBlock, 'name' | 'description'>>
): Promise<void> {
  const client = ensureClient();
  const { error } = await client.from('blocks').update(updates).eq('id', blockId);
  if (error) throw error;
}

export async function deleteBlock(blockId: string): Promise<void> {
  const client = ensureClient();
  const { error } = await client.from('blocks').delete().eq('id', blockId);
  if (error) throw error;
}

// ─────────────────────────────────────────────
// CARD operations
// ─────────────────────────────────────────────

export async function fetchCards(blockId: string): Promise<Card[]> {
  const client = ensureClient();
  const { data, error } = await client
    .from('cards')
    .select('*')
    .eq('block_id', blockId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(dbCardToCard);
}

export async function insertCard(
  card: Omit<Card, 'id' | 'createdAt'>,
  blockId: string,
  userId: string
): Promise<Card> {
  const client = ensureClient();
  const { data, error } = await client
    .from('cards')
    .insert({
      block_id: blockId,
      user_id: userId,
      word: card.word,
      definition: card.definition,
      example_sentence: card.exampleSentence,
      interval: card.interval,
      ease_factor: card.easeFactor,
      repetitions: card.repetitions,
      due_date: card.dueDate,
      state: card.state,
      learning_step: card.learningStep,
    })
    .select()
    .single();
  if (error) throw error;
  return dbCardToCard(data);
}

export async function updateCardContent(
  cardId: string,
  patch: Pick<Card, 'word' | 'definition'>
): Promise<void> {
  const client = ensureClient();
  const { error } = await client
    .from('cards')
    .update({ word: patch.word, definition: patch.definition })
    .eq('id', cardId);
  if (error) throw error;
}

export async function upsertCard(
  card: Card,
  blockId: string,
  userId: string
): Promise<void> {
  const client = ensureClient();
  const row = cardToDbRow(card, blockId, userId);
  const { error } = await client.from('cards').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

export async function updateCardScheduling(
  cardId: string,
  patch: Pick<Card, 'interval' | 'easeFactor' | 'repetitions' | 'dueDate' | 'state' | 'learningStep'>
): Promise<void> {
  const client = ensureClient();
  const { error } = await client
    .from('cards')
    .update({
      interval: patch.interval,
      ease_factor: patch.easeFactor,
      repetitions: patch.repetitions,
      due_date: patch.dueDate,
      state: patch.state,
      learning_step: patch.learningStep,
    })
    .eq('id', cardId);
  if (error) throw error;
}

export async function updateCardExample(
  cardId: string,
  exampleSentence: string | null
): Promise<void> {
  const client = ensureClient();
  const { error } = await client
    .from('cards')
    .update({ example_sentence: exampleSentence })
    .eq('id', cardId);
  if (error) throw error;
}

export async function deleteCard(cardId: string): Promise<void> {
  const client = ensureClient();
  const { error } = await client.from('cards').delete().eq('id', cardId);
  if (error) throw error;
}

// ─────────────────────────────────────────────
// REVIEW HISTORY operations
// ─────────────────────────────────────────────

export async function insertReviewHistory(
  entry: Omit<DbReviewHistory, 'id' | 'reviewed_at'>
): Promise<void> {
  const client = ensureClient();
  const { error } = await client.from('review_history').insert(entry);
  if (error) throw error;
}

export async function fetchReviewHistory(
  userId: string,
  sinceIso?: string
): Promise<DbReviewHistory[]> {
  const client = ensureClient();
  let query = client
    .from('review_history')
    .select('*')
    .eq('user_id', userId)
    .order('reviewed_at', { ascending: true });
  if (sinceIso) {
    query = query.gte('reviewed_at', sinceIso);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DbReviewHistory[];
}

export async function countReviewHistory(userId: string): Promise<number> {
  const client = ensureClient();
  const { count, error } = await client
    .from('review_history')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}
