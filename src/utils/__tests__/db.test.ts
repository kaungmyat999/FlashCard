import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabaseHandle } from './fakeSupabase';
import type { Card } from '../../types';

// ── Hoisted mock of ../lib/supabase ─────────────────
// `vi.mock` is hoisted, so we attach the fake client via a setter the test
// installs in `beforeEach`. The factory returns getters that reach into a
// shared holder; the holder is filled by the test before each call.
const supabaseHolder: { handle: FakeSupabaseHandle | null } = { handle: null };

vi.mock('../../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return true;
  },
  get supabase() {
    return supabaseHolder.handle?.client ?? null;
  },
}));

// Imported AFTER vi.mock so the mock is in effect.
import {
  fetchBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
  fetchCards,
  insertCard,
  updateCardContent,
  updateCardScheduling,
  updateCardExample,
  deleteCard,
  insertReviewHistory,
  countReviewHistory,
  dbCardToCard,
} from '../db';

let fake: FakeSupabaseHandle;

beforeEach(() => {
  fake = createFakeSupabase();
  supabaseHolder.handle = fake;
});

const sampleCardRow = {
  id: 'card-1',
  block_id: 'block-1',
  user_id: 'user-1',
  word: 'ephemeral',
  definition: 'short-lived',
  example_sentence: null,
  interval: 0,
  ease_factor: 2.5,
  repetitions: 0,
  due_date: '2026-06-01T00:00:00Z',
  state: 'new',
  learning_step: 0,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

const baseCard: Card = {
  id: 'card-1',
  word: 'ephemeral',
  definition: 'short-lived',
  exampleSentence: null,
  interval: 0,
  easeFactor: 2.5,
  repetitions: 0,
  dueDate: '2026-06-01T00:00:00Z',
  createdAt: '2026-06-01T00:00:00Z',
  state: 'new',
  learningStep: 0,
};

// ─────────────────────────────────────────────
// Row ↔ Card mapping
// ─────────────────────────────────────────────
describe('dbCardToCard', () => {
  it('maps snake_case DB columns to camelCase Card fields', () => {
    const card = dbCardToCard(sampleCardRow);
    expect(card).toEqual(baseCard);
  });

  it('defaults missing state / learning_step from legacy rows', () => {
    const legacy = { ...sampleCardRow } as unknown as Record<string, unknown>;
    delete legacy.state;
    delete legacy.learning_step;
    const card = dbCardToCard(legacy as unknown as typeof sampleCardRow);
    expect(card.state).toBe('new');
    expect(card.learningStep).toBe(0);
  });
});

// ─────────────────────────────────────────────
// BLOCKS
// ─────────────────────────────────────────────
describe('block CRUD', () => {
  it('fetchBlocks selects from `blocks` ordered by created_at asc', async () => {
    fake.setNextResponse({ data: [{ id: 'b1', name: 'B' }], error: null });
    const blocks = await fetchBlocks();
    expect(blocks).toHaveLength(1);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].table).toBe('blocks');
    const ops = fake.calls[0].ops.map((o) => o.op);
    expect(ops).toEqual(['select', 'order']);
    expect(fake.calls[0].ops[0].args).toEqual(['*']);
    expect(fake.calls[0].ops[1].args).toEqual(['created_at', { ascending: true }]);
  });

  it('fetchBlocks returns [] when data is null', async () => {
    fake.setNextResponse({ data: null, error: null });
    const blocks = await fetchBlocks();
    expect(blocks).toEqual([]);
  });

  it('fetchBlocks rethrows the supabase error', async () => {
    fake.setNextResponse({ data: null, error: { message: 'boom' } });
    await expect(fetchBlocks()).rejects.toMatchObject({ message: 'boom' });
  });

  it('createBlock inserts the user_id/name/description and returns the row', async () => {
    fake.setNextResponse({
      data: { id: 'b1', user_id: 'u1', name: 'GRE', description: 'verbs' },
      error: null,
    });
    const block = await createBlock('u1', 'GRE', 'verbs');
    expect(block.id).toBe('b1');
    const ops = fake.calls[0].ops;
    expect(ops[0].op).toBe('insert');
    expect(ops[0].args[0]).toEqual({ user_id: 'u1', name: 'GRE', description: 'verbs', block_type: 'vocab' });
    expect(ops[1].op).toBe('select');
    expect(ops[2].op).toBe('single');
  });

  it('createBlock defaults description to empty string when omitted', async () => {
    fake.setNextResponse({ data: { id: 'b1' }, error: null });
    await createBlock('u1', 'GRE');
    expect(fake.calls[0].ops[0].args[0]).toEqual({
      user_id: 'u1',
      name: 'GRE',
      description: '',
      block_type: 'vocab',
    });
  });

  it('updateBlock patches the row by id', async () => {
    fake.setNextResponse({ data: null, error: null });
    await updateBlock('b1', { name: 'New name' });
    expect(fake.calls[0].table).toBe('blocks');
    expect(fake.calls[0].ops[0]).toEqual({ op: 'update', args: [{ name: 'New name' }] });
    expect(fake.calls[0].ops[1]).toEqual({ op: 'eq', args: ['id', 'b1'] });
  });

  it('deleteBlock deletes by id', async () => {
    fake.setNextResponse({ data: null, error: null });
    await deleteBlock('b1');
    expect(fake.calls[0].ops).toEqual([
      { op: 'delete', args: [] },
      { op: 'eq', args: ['id', 'b1'] },
    ]);
  });
});

// ─────────────────────────────────────────────
// CARDS
// ─────────────────────────────────────────────
describe('card CRUD', () => {
  it('fetchCards selects by block_id and orders by created_at', async () => {
    fake.setNextResponse({ data: [sampleCardRow], error: null });
    const cards = await fetchCards('block-1');
    expect(cards).toHaveLength(1);
    expect(cards[0].word).toBe('ephemeral');
    const ops = fake.calls[0].ops;
    expect(ops[0].op).toBe('select');
    expect(ops[1]).toEqual({ op: 'eq', args: ['block_id', 'block-1'] });
    expect(ops[2].op).toBe('order');
  });

  it('insertCard includes state and learning_step', async () => {
    fake.setNextResponse({ data: sampleCardRow, error: null });
    const result = await insertCard(
      {
        word: 'ephemeral',
        definition: 'short-lived',
        exampleSentence: null,
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
        dueDate: '2026-06-01T00:00:00Z',
        state: 'new',
        learningStep: 0,
      },
      'block-1',
      'user-1'
    );
    expect(result.id).toBe('card-1');
    const inserted = fake.calls[0].ops[0].args[0] as Record<string, unknown>;
    expect(inserted.block_id).toBe('block-1');
    expect(inserted.user_id).toBe('user-1');
    expect(inserted.state).toBe('new');
    expect(inserted.learning_step).toBe(0);
    expect(inserted.ease_factor).toBe(2.5);
    expect(inserted.due_date).toBe('2026-06-01T00:00:00Z');
  });

  it('updateCardContent updates only word and definition', async () => {
    fake.setNextResponse({ data: null, error: null });
    await updateCardContent('card-1', { word: 'new word', definition: 'new def' });
    const ops = fake.calls[0].ops;
    expect(ops[0]).toEqual({ op: 'update', args: [{ word: 'new word', definition: 'new def' }] });
    expect(ops[1]).toEqual({ op: 'eq', args: ['id', 'card-1'] });
  });

  it('updateCardScheduling writes Anki scheduler fields', async () => {
    fake.setNextResponse({ data: null, error: null });
    await updateCardScheduling('card-1', {
      interval: 4,
      easeFactor: 2.35,
      repetitions: 2,
      dueDate: '2026-06-05T00:00:00Z',
      state: 'review',
      learningStep: 0,
    });
    const updateArg = fake.calls[0].ops[0].args[0] as Record<string, unknown>;
    expect(updateArg).toEqual({
      interval: 4,
      ease_factor: 2.35,
      repetitions: 2,
      due_date: '2026-06-05T00:00:00Z',
      state: 'review',
      learning_step: 0,
    });
  });

  it('updateCardExample patches example_sentence', async () => {
    fake.setNextResponse({ data: null, error: null });
    await updateCardExample('card-1', 'It was ephemeral.');
    expect(fake.calls[0].ops[0]).toEqual({
      op: 'update',
      args: [{ example_sentence: 'It was ephemeral.' }],
    });
  });

  it('updateCardExample accepts null to clear', async () => {
    fake.setNextResponse({ data: null, error: null });
    await updateCardExample('card-1', null);
    expect(fake.calls[0].ops[0].args[0]).toEqual({ example_sentence: null });
  });

  it('deleteCard deletes by id', async () => {
    fake.setNextResponse({ data: null, error: null });
    await deleteCard('card-1');
    expect(fake.calls[0].ops).toEqual([
      { op: 'delete', args: [] },
      { op: 'eq', args: ['id', 'card-1'] },
    ]);
  });

  it('propagates supabase errors from insertCard', async () => {
    fake.setNextResponse({ data: null, error: { message: 'rls violation' } });
    await expect(
      insertCard(
        { ...baseCard } as unknown as Parameters<typeof insertCard>[0],
        'block-1',
        'user-1'
      )
    ).rejects.toMatchObject({ message: 'rls violation' });
  });
});

// ─────────────────────────────────────────────
// REVIEW HISTORY
// ─────────────────────────────────────────────
describe('review history', () => {
  it('insertReviewHistory inserts the provided entry', async () => {
    fake.setNextResponse({ data: null, error: null });
    await insertReviewHistory({
      card_id: 'card-1',
      user_id: 'user-1',
      word: 'ephemeral',
      quality: 3,
      old_interval: 0,
      new_interval: 1,
      old_ease_factor: 2.5,
      new_ease_factor: 2.5,
    });
    expect(fake.calls[0].table).toBe('review_history');
    const inserted = fake.calls[0].ops[0].args[0] as Record<string, unknown>;
    expect(inserted.quality).toBe(3);
    expect(inserted.user_id).toBe('user-1');
  });

  it('countReviewHistory returns the count for the user', async () => {
    fake.setNextResponse({ count: 42, data: null, error: null });
    const n = await countReviewHistory('user-1');
    expect(n).toBe(42);
    const ops = fake.calls[0].ops;
    expect(ops[0].op).toBe('select');
    expect(ops[0].args).toEqual(['id', { count: 'exact', head: true }]);
    expect(ops[1]).toEqual({ op: 'eq', args: ['user_id', 'user-1'] });
  });

  it('countReviewHistory returns 0 when supabase returns null count', async () => {
    fake.setNextResponse({ count: null, data: null, error: null });
    const n = await countReviewHistory('user-1');
    expect(n).toBe(0);
  });
});
