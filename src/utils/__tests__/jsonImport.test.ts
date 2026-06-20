import { describe, it, expect } from 'vitest';
import { parseImportJson, dictionaryUrl, ImportParseError } from '../jsonImport';

describe('parseImportJson', () => {
  it('parses a single block with a meaning into a definition + example', () => {
    const json = JSON.stringify({
      'Common Words I': [
        {
          vocab_name: 'amenable',
          meaning: 'adjective: easily persuaded',
          example_text: 'Shirley was generally amenable.',
        },
      ],
    });
    const { blocks } = parseImportJson(json);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe('Common Words I');
    expect(blocks[0].entries[0]).toEqual({
      word: 'amenable',
      definition: 'adjective: easily persuaded',
      exampleSentence: 'Shirley was generally amenable.',
      usedDictionaryFallback: false,
    });
  });

  it('falls back to a Merriam-Webster link when meaning is missing or blank', () => {
    const json = JSON.stringify({
      Deck: [
        { vocab_name: 'amenable' }, // no meaning
        { vocab_name: 'ad hoc', meaning: '   ' }, // blank meaning, multi-word
      ],
    });
    const { blocks } = parseImportJson(json);
    expect(blocks[0].entries[0].definition).toBe(
      'https://www.merriam-webster.com/dictionary/amenable'
    );
    expect(blocks[0].entries[0].usedDictionaryFallback).toBe(true);
    expect(blocks[0].entries[1].definition).toBe(
      'https://www.merriam-webster.com/dictionary/ad%20hoc'
    );
  });

  it('creates one parsed block per top-level key', () => {
    const json = JSON.stringify({
      'Common Words I': [{ vocab_name: 'a', meaning: 'first' }],
      'Common Words II': [{ vocab_name: 'b', meaning: 'second' }],
    });
    const { blocks } = parseImportJson(json);
    expect(blocks.map((b) => b.name)).toEqual(['Common Words I', 'Common Words II']);
  });

  it('treats a missing example_text as null', () => {
    const json = JSON.stringify({ D: [{ vocab_name: 'x', meaning: 'm' }] });
    const { blocks } = parseImportJson(json);
    expect(blocks[0].entries[0].exampleSentence).toBeNull();
  });

  it('rejects invalid JSON', () => {
    expect(() => parseImportJson('{ not json')).toThrow(ImportParseError);
  });

  it('rejects a top-level array', () => {
    expect(() => parseImportJson('[]')).toThrow(/object mapping block names/);
  });

  it('rejects a block whose value is not an array', () => {
    expect(() => parseImportJson(JSON.stringify({ D: { vocab_name: 'x' } }))).toThrow(
      /must be an array/
    );
  });

  it('rejects an entry missing vocab_name', () => {
    expect(() => parseImportJson(JSON.stringify({ D: [{ meaning: 'm' }] }))).toThrow(
      /missing "vocab_name"/
    );
  });

  it('encodes the actual word in the dictionary URL', () => {
    expect(dictionaryUrl('café')).toBe('https://www.merriam-webster.com/dictionary/caf%C3%A9');
  });
});
