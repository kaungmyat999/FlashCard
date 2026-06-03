import type { Card, CardState } from '../types';

/**
 * Anki-style scheduler (SM-2 variant used by Anki's default scheduler).
 *
 * Buttons: 1=Again, 2=Hard, 3=Good, 4=Easy.
 *
 * Cards move through: new → learning → review, with review lapses sending
 * the card to relearning before it re-enters review.
 */

export type AnkiRating = 1 | 2 | 3 | 4;

// Anki default deck options
const LEARNING_STEPS_MIN = [1, 10]; // minutes
const RELEARNING_STEPS_MIN = [10];
const GRADUATING_INTERVAL_DAYS = 1;
const EASY_INTERVAL_DAYS = 4;
const STARTING_EASE = 2.5;
const MIN_EASE = 1.3;
const EASY_BONUS = 1.3;
const HARD_INTERVAL_MULT = 1.2;
const LAPSE_INTERVAL_MULT = 0.0; // Anki defaults to "0%" — relearning starts fresh
const LAPSE_MIN_INTERVAL_DAYS = 1;

export const STARTING_EASE_FACTOR = STARTING_EASE;

export interface SchedulerOutput {
  state: CardState;
  learningStep: number;
  interval: number;
  easeFactor: number;
  repetitions: number;
  dueDate: string;
}

type SchedulerInput = Pick<
  Card,
  'state' | 'learningStep' | 'interval' | 'easeFactor' | 'repetitions'
>;

const minutesFromNow = (mins: number): string =>
  new Date(Date.now() + mins * 60 * 1000).toISOString();
const daysFromNow = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

function clampEase(e: number): number {
  return Math.max(MIN_EASE, parseFloat(e.toFixed(2)));
}

function scheduleLearning(card: SchedulerInput, rating: AnkiRating): SchedulerOutput {
  const steps = card.state === 'relearning' ? RELEARNING_STEPS_MIN : LEARNING_STEPS_MIN;
  const ease = card.easeFactor || STARTING_EASE;
  const baseInterval = card.state === 'relearning' ? card.interval : 0;

  if (rating === 1) {
    return {
      state: card.state === 'relearning' ? 'relearning' : 'learning',
      learningStep: 0,
      interval: baseInterval,
      easeFactor: ease,
      repetitions: 0,
      dueDate: minutesFromNow(steps[0]),
    };
  }

  if (rating === 2) {
    const stepIdx = Math.min(card.learningStep, steps.length - 1);
    return {
      state: card.state === 'relearning' ? 'relearning' : 'learning',
      learningStep: stepIdx,
      interval: baseInterval,
      easeFactor: ease,
      repetitions: card.repetitions,
      dueDate: minutesFromNow(steps[stepIdx]),
    };
  }

  if (rating === 3) {
    const nextStep = card.learningStep + 1;
    if (nextStep >= steps.length) {
      // Graduate
      const graduateInterval =
        card.state === 'relearning' ? Math.max(LAPSE_MIN_INTERVAL_DAYS, baseInterval) : GRADUATING_INTERVAL_DAYS;
      return {
        state: 'review',
        learningStep: 0,
        interval: graduateInterval,
        easeFactor: ease,
        repetitions: card.repetitions + 1,
        dueDate: daysFromNow(graduateInterval),
      };
    }
    return {
      state: card.state === 'relearning' ? 'relearning' : 'learning',
      learningStep: nextStep,
      interval: baseInterval,
      easeFactor: ease,
      repetitions: card.repetitions,
      dueDate: minutesFromNow(steps[nextStep]),
    };
  }

  // rating === 4 → Easy: graduate immediately with the easy interval
  const easyInterval =
    card.state === 'relearning'
      ? Math.max(EASY_INTERVAL_DAYS, baseInterval)
      : EASY_INTERVAL_DAYS;
  return {
    state: 'review',
    learningStep: 0,
    interval: easyInterval,
    easeFactor: ease,
    repetitions: card.repetitions + 1,
    dueDate: daysFromNow(easyInterval),
  };
}

function scheduleReview(card: SchedulerInput, rating: AnkiRating): SchedulerOutput {
  const ease = card.easeFactor || STARTING_EASE;
  const currentInterval = Math.max(1, card.interval);

  if (rating === 1) {
    // Lapse → relearning
    const newEase = clampEase(ease - 0.2);
    const lapsedInterval = Math.max(
      LAPSE_MIN_INTERVAL_DAYS,
      Math.round(currentInterval * LAPSE_INTERVAL_MULT)
    );
    return {
      state: 'relearning',
      learningStep: 0,
      interval: lapsedInterval,
      easeFactor: newEase,
      repetitions: 0,
      dueDate: minutesFromNow(RELEARNING_STEPS_MIN[0]),
    };
  }

  if (rating === 2) {
    const newEase = clampEase(ease - 0.15);
    const newInterval = Math.max(currentInterval + 1, Math.round(currentInterval * HARD_INTERVAL_MULT));
    return {
      state: 'review',
      learningStep: 0,
      interval: newInterval,
      easeFactor: newEase,
      repetitions: card.repetitions + 1,
      dueDate: daysFromNow(newInterval),
    };
  }

  if (rating === 3) {
    const newInterval = Math.max(currentInterval + 1, Math.round(currentInterval * ease));
    return {
      state: 'review',
      learningStep: 0,
      interval: newInterval,
      easeFactor: ease,
      repetitions: card.repetitions + 1,
      dueDate: daysFromNow(newInterval),
    };
  }

  // Easy
  const newEase = clampEase(ease + 0.15);
  const newInterval = Math.max(currentInterval + 1, Math.round(currentInterval * ease * EASY_BONUS));
  return {
    state: 'review',
    learningStep: 0,
    interval: newInterval,
    easeFactor: newEase,
    repetitions: card.repetitions + 1,
    dueDate: daysFromNow(newInterval),
  };
}

export function calculateAnki(card: SchedulerInput, rating: AnkiRating): SchedulerOutput {
  if (card.state === 'review') return scheduleReview(card, rating);
  // 'new', 'learning', 'relearning' all use the learning-style scheduler.
  return scheduleLearning(card, rating);
}

/**
 * Returns a short human label for what tapping a given rating button will do
 * — useful for showing the projected interval under each button.
 */
export function previewLabel(card: SchedulerInput, rating: AnkiRating): string {
  const result =
    card.state === 'review' ? scheduleReview(card, rating) : scheduleLearning(card, rating);
  if (result.state === 'learning' || result.state === 'relearning') {
    const stepMin = (result.state === 'relearning' ? RELEARNING_STEPS_MIN : LEARNING_STEPS_MIN)[
      result.learningStep
    ];
    if (stepMin < 60) return `${stepMin}m`;
    return `${Math.round(stepMin / 60)}h`;
  }
  const days = result.interval;
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
