export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface Card {
  id: string;
  word: string;
  definition: string;
  exampleSentence: string | null;
  interval: number; // days (review) or 0 while in learning
  easeFactor: number; // multiplier, starts at 2.5
  repetitions: number; // consecutive successful reviews in review state
  dueDate: string; // ISO string
  createdAt: string;
  state: CardState;
  learningStep: number; // index into the learning/relearning step list
}

export interface ReviewHistoryEntry {
  cardId: string;
  word: string;
  timestamp: string;
  quality: number; // Anki rating: 1=Again, 2=Hard, 3=Good, 4=Easy
  oldInterval: number;
  newInterval: number;
  oldEaseFactor: number;
  newEaseFactor: number;
}
