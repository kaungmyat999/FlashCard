import { describe, it, expect } from 'vitest';
import { computeStats } from '../stats';
import type { DbReviewHistory } from '../db';

const NOW = new Date('2026-06-15T12:00:00Z');

function row(
  partial: Partial<DbReviewHistory> & {
    reviewed_at: string;
    quality: number;
    old_interval?: number;
    new_interval?: number;
    card_id?: string;
    word?: string;
  }
): DbReviewHistory {
  return {
    id: 'r' + Math.random().toString(36).slice(2),
    card_id: partial.card_id ?? 'card-1',
    user_id: 'u1',
    word: partial.word ?? 'ephemeral',
    quality: partial.quality,
    old_interval: partial.old_interval ?? 0,
    new_interval: partial.new_interval ?? 1,
    old_ease_factor: 2.5,
    new_ease_factor: 2.5,
    reviewed_at: partial.reviewed_at,
  };
}

describe('computeStats', () => {
  it('returns zeros for empty history', () => {
    const s = computeStats([], NOW);
    expect(s.totalReviews).toBe(0);
    expect(s.retentionRate).toBe(0);
    expect(s.retentionRate7d).toBe(0);
    expect(s.cardsGraduated).toBe(0);
    expect(s.activeDays).toBe(0);
    expect(s.reviewsPerDay).toHaveLength(14);
    expect(s.reviewsPerDay.every((b) => b.total === 0)).toBe(true);
  });

  it('counts pass vs fail correctly (Again=1 fails, Hard/Good/Easy pass)', () => {
    const rows = [
      row({ reviewed_at: '2026-06-14T10:00:00Z', quality: 1 }), // fail
      row({ reviewed_at: '2026-06-14T11:00:00Z', quality: 2 }), // pass
      row({ reviewed_at: '2026-06-14T12:00:00Z', quality: 3 }), // pass
      row({ reviewed_at: '2026-06-14T13:00:00Z', quality: 4 }), // pass
    ];
    const s = computeStats(rows, NOW);
    expect(s.totalReviews).toBe(4);
    expect(s.passedReviews).toBe(3);
    expect(s.retentionRate).toBeCloseTo(0.75);
  });

  it('windows 7-day retention separately from overall', () => {
    const rows = [
      // Old (>7d ago): all fails
      row({ reviewed_at: '2026-05-01T00:00:00Z', quality: 1 }),
      row({ reviewed_at: '2026-05-02T00:00:00Z', quality: 1 }),
      // Recent (<7d): all passes
      row({ reviewed_at: '2026-06-13T00:00:00Z', quality: 3 }),
      row({ reviewed_at: '2026-06-14T00:00:00Z', quality: 3 }),
    ];
    const s = computeStats(rows, NOW);
    expect(s.retentionRate).toBeCloseTo(0.5);
    expect(s.retentionRate7d).toBeCloseTo(1.0);
  });

  it('counts a graduation only once per card', () => {
    const rows = [
      row({ card_id: 'c1', reviewed_at: '2026-06-10T00:00:00Z', quality: 3, old_interval: 0, new_interval: 1 }),
      row({ card_id: 'c1', reviewed_at: '2026-06-11T00:00:00Z', quality: 3, old_interval: 1, new_interval: 4 }),
      row({ card_id: 'c2', reviewed_at: '2026-06-12T00:00:00Z', quality: 4, old_interval: 0, new_interval: 4 }),
      // Not a graduation (already in review)
      row({ card_id: 'c3', reviewed_at: '2026-06-13T00:00:00Z', quality: 3, old_interval: 4, new_interval: 10 }),
    ];
    const s = computeStats(rows, NOW);
    expect(s.cardsGraduated).toBe(2);
  });

  it('counts unique active days', () => {
    const rows = [
      row({ reviewed_at: '2026-06-14T01:00:00Z', quality: 3 }),
      row({ reviewed_at: '2026-06-14T22:00:00Z', quality: 3 }),
      row({ reviewed_at: '2026-06-13T10:00:00Z', quality: 3 }),
    ];
    const s = computeStats(rows, NOW);
    expect(s.activeDays).toBe(2);
    expect(s.avgReviewsPerActiveDay).toBeCloseTo(1.5);
  });

  it('learning rate per week is graduations divided by weeks since first review', () => {
    const rows = [
      // first review 14 days before NOW = 2 weeks
      row({ card_id: 'c1', reviewed_at: '2026-06-01T12:00:00Z', quality: 3, old_interval: 0, new_interval: 1 }),
      row({ card_id: 'c2', reviewed_at: '2026-06-05T12:00:00Z', quality: 3, old_interval: 0, new_interval: 1 }),
    ];
    const s = computeStats(rows, NOW);
    // 2 graduations over ~2 weeks => ~1.0 per week
    expect(s.learningRatePerWeek).toBeCloseTo(1.0, 1);
  });

  it('reviewsPerDay is 14 buckets ending today, with today populated', () => {
    const rows = [
      row({ reviewed_at: NOW.toISOString(), quality: 3 }),
      row({ reviewed_at: NOW.toISOString(), quality: 1 }),
    ];
    const s = computeStats(rows, NOW);
    const today = s.reviewsPerDay[s.reviewsPerDay.length - 1];
    expect(today.total).toBe(2);
    expect(today.passed).toBe(1);
    expect(s.reviewsToday).toBe(2);
  });
});
