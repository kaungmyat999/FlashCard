const MW_API_KEY = import.meta.env.VITE_MW_API_KEY as string | undefined;

interface MwEntry {
  fl?: string;
  shortdef?: string[];
  hwi?: {
    prs?: { sound?: { audio?: string } }[];
  };
}

// Build the playable audio URL from a Merriam-Webster `audio` filename.
// Subdirectory rules per the MW API docs:
// https://dictionaryapi.com/products/json#sec-2.prs
function mwAudioUrl(audio: string): string {
  let sub: string;
  if (audio.startsWith('bix')) sub = 'bix';
  else if (audio.startsWith('gg')) sub = 'gg';
  else if (/^[^a-zA-Z]/.test(audio)) sub = 'number';
  else sub = audio[0];
  return `https://media.merriam-webster.com/audio/prons/en/us/mp3/${sub}/${audio}.mp3`;
}

// Returns a URL to the pronunciation audio for `word`, or null if unavailable.
export async function fetchMwAudioUrl(word: string): Promise<string | null> {
  if (!word.trim() || !MW_API_KEY) return null;
  const url = `https://dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(word.trim())}?key=${MW_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pronunciation lookup failed (${res.status})`);
  const data: (MwEntry | string)[] = await res.json();
  if (!Array.isArray(data) || data.length === 0 || typeof data[0] === 'string') return null;
  const audio = (data[0] as MwEntry).hwi?.prs?.find((p) => p.sound?.audio)?.sound?.audio;
  return audio ? mwAudioUrl(audio) : null;
}

export async function fetchMwDefinition(word: string): Promise<{ definition: string; partOfSpeech: string } | null> {
  if (!word.trim() || !MW_API_KEY) return null;
  const url = `https://dictionaryapi.com/api/v3/references/collegiate/json/${encodeURIComponent(word.trim())}?key=${MW_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Dictionary lookup failed (${res.status})`);
  const data: (MwEntry | string)[] = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  // API returns string[] when word not found (suggestions only)
  if (typeof data[0] === 'string') return null;
  const entry = data[0] as MwEntry;
  const shortdefs = entry.shortdef ?? [];
  if (shortdefs.length === 0) return null;
  return {
    definition: shortdefs.slice(0, 3).join('; '),
    partOfSpeech: entry.fl ?? '',
  };
}
