const MW_API_KEY = import.meta.env.VITE_MW_API_KEY as string | undefined;

interface MwEntry {
  fl?: string;
  shortdef?: string[];
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
