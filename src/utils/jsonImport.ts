// Parse & normalize the vocab-import JSON format:
//
//   {
//     "Common Words I": [
//       { "vocab_name": "amenable", "meaning": "adjective: easily persuaded", "example_text": "..." },
//       ...
//     ],
//     "Common Words II": [ ... ]
//   }
//
// Each top-level key is a block ("envelope") name. Every entry becomes a card:
//   - if "meaning" is present  → the back is that meaning (+ example sentence)
//   - if "meaning" is missing  → the back falls back to a Merriam-Webster link for the word

export interface RawVocabEntry {
  vocab_name?: unknown;
  meaning?: unknown;
  example_text?: unknown;
}

export interface NormalizedEntry {
  word: string;
  definition: string;
  exampleSentence: string | null;
  /** true when "meaning" was absent and we substituted a dictionary link */
  usedDictionaryFallback: boolean;
}

export interface ParsedBlock {
  name: string;
  entries: NormalizedEntry[];
}

export interface ParseResult {
  blocks: ParsedBlock[];
}

/** Thrown for any structural problem in the import file. Message is user-facing. */
export class ImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportParseError';
  }
}

const MW_BASE = 'https://www.merriam-webster.com/dictionary/';

/** Merriam-Webster dictionary URL for the actual word (spaces etc. percent-encoded). */
export function dictionaryUrl(word: string): string {
  return MW_BASE + encodeURIComponent(word.trim());
}

export function parseImportJson(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new ImportParseError(`File is not valid JSON: ${(e as Error).message}`);
  }

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ImportParseError(
      'Expected a JSON object mapping block names to arrays of vocab entries.'
    );
  }

  const blocks: ParsedBlock[] = [];
  for (const [rawName, rawEntries] of Object.entries(data as Record<string, unknown>)) {
    const name = rawName.trim();
    if (!name) {
      throw new ImportParseError('Found a block with an empty name.');
    }
    if (!Array.isArray(rawEntries)) {
      throw new ImportParseError(`Block "${name}" must be an array of vocab entries.`);
    }

    const entries: NormalizedEntry[] = rawEntries.map((raw, i) => {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new ImportParseError(`Block "${name}", entry ${i + 1} is not an object.`);
      }
      const e = raw as RawVocabEntry;
      const word = typeof e.vocab_name === 'string' ? e.vocab_name.trim() : '';
      if (!word) {
        throw new ImportParseError(`Block "${name}", entry ${i + 1} is missing "vocab_name".`);
      }
      const meaning = typeof e.meaning === 'string' ? e.meaning.trim() : '';
      const example = typeof e.example_text === 'string' ? e.example_text.trim() : '';
      const usedDictionaryFallback = meaning.length === 0;
      return {
        word,
        definition: usedDictionaryFallback ? dictionaryUrl(word) : meaning,
        exampleSentence: example.length > 0 ? example : null,
        usedDictionaryFallback,
      };
    });

    blocks.push({ name, entries });
  }

  if (blocks.length === 0) {
    throw new ImportParseError('No blocks found in the file.');
  }
  return { blocks };
}
