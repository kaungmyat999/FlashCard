# Roadmap: Spaced Repetition (Anki-like) Flashcard Web App

This document outlines the design, architecture, and implementation steps for building the Flashcard Web App. The app features an Anki-style spaced repetition algorithm, Gemini-powered example sentence generation, and a sleek, premium, modern UI.

---

## 🛠️ Architecture & Tech Stack

1. **Frontend**: Vite + React + TypeScript (for strong typing and developer productivity).
2. **Styling**: Vanilla CSS with modern custom properties (CSS variables), CSS grid/flexbox, animations, glassmorphism, and a dark/cyberpunk or premium minimalist theme.
3. **Database/Storage**: LocalStorage for persisting decks, cards, review history, and settings (including the Google API Key).
4. **LLM Integration**: Google Gemini API (`gemini-2.5-flash`) called directly from the frontend using fetch for ultra-lightweight integration. No backend server required for this phase.
5. **Algorithm**: SuperMemo SM-2 Spaced Repetition Algorithm.

---

## 📅 Phases of Development

### Phase 1: Setup & Project Initialization
- [x] Initialize Vite + React project with TypeScript.
- [x] Establish design tokens (colors, typography, spacing, shadows, glassmorphism details) in `index.css`.
- [x] Set up basic folder structure:
  - `src/types.ts` - TypeScript core schemas.
  - `src/hooks/` - Custom React hooks (e.g., `useLocalStorage`).
  - `src/utils/` - Spaced repetition logic (`sm2.ts`) and Gemini API handler (`gemini.ts`).

### Phase 2: Core Spaced Repetition Logic (SM-2)
- [x] Define TypeScript interfaces for `Card` and `ReviewHistoryEntry`.
- [x] Implement the SM-2 algorithm:
  - Input: quality grade (0 to 5), current interval, repetitions, and ease factor (EF).
  - Output: new interval, new repetitions, and new ease factor.
- [x] Verified and compiled the algorithm with TypeScript.

### Phase 3: Premium UI & Core Views
- [x] **App Layout**: Clean navigation, responsive grid, glassmorphism header, and dark mode theme.
- [x] **Dashboard View**:
  - Show statistics: Total cards, due today, learning/new, and reviews completed.
  - Quick action to "Start Session" of due cards.
- [x] **Add Card View**:
  - Input fields for `Word` and `Definition`.
  - Redirects back to dashboard upon adding.
- [x] **Study View (The Flashcard Arena)**:
  - Beautiful 3D card flipping animation (front/back).
  - Front shows the Word.
  - Back shows the Definition, the Generated Example Sentence, and Anki rating buttons:
    - **Again** (Red, Grade 0): Forgot, show again soon.
    - **Hard** (Orange, Grade 3): Remembered, but with effort.
    - **Good** (Green, Grade 4): Normal recall.
    - **Easy** (Blue, Grade 5): Easy recall.
- [x] **Settings View**:
  - Store Google Gemini API Key securely in local storage.
  - Direct link to Google AI Studio for obtaining a key.
  - Clear data / reset deck back to seeds button.

### Phase 4: Gemini Example Sentence Integration
- [x] Connect the "Get Example Sentence" action to the Google Gemini API.
- [x] Use `gemini-2.5-flash` for fast, cost-effective generation.
- [x] Include micro-animations (shimmer loading bar) while fetching the sentence.
- [x] Cache generated sentences on the card object.

### Phase 5: Polishing & Micro-interactions
- [x] Smooth card flipping css animation with transform-style.
- [x] Clean hover transitions for buttons and cards.
- [x] Responsive layout adapted for mobile, tablet, and desktop screens.
- [x] Completed and verified build process.

---

## 🧠 The Spaced Repetition Algorithm (SM-2)

The SuperMemo-2 (SM-2) algorithm calculates the next interval $I$ for a card review:

1. **For Grade $q \ge 3$ (Correct Response)**:
   - If it is the first repetition ($n = 1$), the next interval is $I(1) = 1$ day.
   - If it is the second repetition ($n = 2$), the next interval is $I(2) = 6$ days.
   - For repetitions $n > 2$, the next interval is:
     $$I(n) = I(n-1) \times EF$$
2. **For Grade $q < 3$ (Incorrect Response)**:
   - Reset repetitions $n = 0$.
   - Set the interval to $I = 1$ day.
3. **Updating the Ease Factor ($EF$)**:
   - Update $EF$ after each review:
     $$EF' = EF + (0.1 - (5 - q) \times (0.08 + (5 - q) \times 0.02))$$
     *(Where $EF'$ is capped at a minimum of 1.3)*

### Grade Mapping:
- **0 (Again)**: Complete blackout.
- **3 (Hard)**: Correct response recalled with serious difficulty.
- **4 (Good)**: Correct response after a hesitation.
- **5 (Easy)**: Perfect response.
