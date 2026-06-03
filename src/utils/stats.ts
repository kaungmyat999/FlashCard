import type { DbReviewHistory } from './db';

export interface DailyBucket {
  date: string; // YYYY-MM-DD
  total: number;
  passed: number;
}

export interface StatsMetrics {
  totalReviews: number;
  passedReviews: number;
  retentionRate: number; // 0..1 over all reviews
  retentionRate7d: number; // 0..1 in the last 7 days
  cardsGraduated: number; // distinct cards that transitioned learning → review
  uniqueWordsReviewed: number;
  activeDays: number; // distinct calendar days with at least one review
  reviewsPerDay: DailyBucket[]; // last 14 days, oldest first, zero-filled
  avgReviewsPerActiveDay: number;
  learningRatePerWeek: number; // graduations divided by weeks since first review
  reviewsToday: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A "pass" in Anki's 4-button system = Hard/Good/Easy. Again (1) is a fail. */
function isPass(quality: number): boolean {
  return quality >= 2;
}

/** A graduation = card left learning (old_interval === 0) for a real interval. */
function isGraduation(row: DbReviewHistory): boolean {
  return row.old_interval === 0 && row.new_interval >= 1;
}

function ymd(d: Date): string {
  // Local-time YYYY-MM-DD so "today" matches the user's clock.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeStats(
  rows: DbReviewHistory[],
  now: Date = new Date()
): StatsMetrics {
  const total = rows.length;
  const passed = rows.filter((r) => isPass(r.quality)).length;
  const retentionRate = total === 0 ? 0 : passed / total;

  const cutoff7d = now.getTime() - 7 * DAY_MS;
  const recent = rows.filter((r) => new Date(r.reviewed_at).getTime() >= cutoff7d);
  const retentionRate7d =
    recent.length === 0 ? 0 : recent.filter((r) => isPass(r.quality)).length / recent.length;

  const graduatedCardIds = new Set<string>();
  for (const r of rows) {
    if (isGraduation(r)) graduatedCardIds.add(r.card_id);
  }

  const uniqueWords = new Set(rows.map((r) => r.word));
  const dayKeys = new Set(rows.map((r) => ymd(new Date(r.reviewed_at))));
  const activeDays = dayKeys.size;

  // Build last-14-days bucket, oldest first.
  const buckets: DailyBucket[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    buckets.push({ date: ymd(d), total: 0, passed: 0 });
  }
  const byDate = new Map(buckets.map((b) => [b.date, b]));
  for (const r of rows) {
    const key = ymd(new Date(r.reviewed_at));
    const b = byDate.get(key);
    if (b) {
      b.total += 1;
      if (isPass(r.quality)) b.passed += 1;
    }
  }

  const reviewsToday = byDate.get(ymd(now))?.total ?? 0;
  const avgReviewsPerActiveDay = activeDays === 0 ? 0 : total / activeDays;

  // Learning rate per week: graduations / (weeks since first review, min 1).
  let learningRatePerWeek = 0;
  if (rows.length > 0) {
    const first = new Date(rows[0].reviewed_at).getTime();
    const weeks = Math.max(1, (now.getTime() - first) / (7 * DAY_MS));
    learningRatePerWeek = graduatedCardIds.size / weeks;
  }

  return {
    totalReviews: total,
    passedReviews: passed,
    retentionRate,
    retentionRate7d,
    cardsGraduated: graduatedCardIds.size,
    uniqueWordsReviewed: uniqueWords.size,
    activeDays,
    reviewsPerDay: buckets,
    avgReviewsPerActiveDay,
    learningRatePerWeek,
    reviewsToday,
  };
}
