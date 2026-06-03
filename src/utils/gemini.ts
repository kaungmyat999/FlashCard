/**
 * Generates an example sentence using the Google Gemini API.
 * Uses fetch to prevent adding external dependencies to the bundle.
 *
 * @param word The vocabulary word
 * @param definition The definition of the word to provide context for the model
 * @param apiKey The Google Gemini API Key
 * @param model The Gemini model to call (defaults to gemini-1.5-flash)
 */
export async function generateExampleSentence(
  word: string,
  definition: string,
  apiKey: string,
  model: string = 'gemini-1.5-flash'
): Promise<string> {
  const cleanKey = apiKey.trim();
  if (cleanKey === '') {
    throw new Error('Google Gemini API Key is missing. Please set it in the Settings.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;

  const prompt = `Generate a single, concise, and natural example sentence using the vocabulary word "${word}". 
The definition of "${word}" is: "${definition}". 
The sentence should provide strong contextual clues about the word's meaning. 
Respond ONLY with the generated example sentence. Do not wrap it in quotes, do not include markdown, explanations, introductory text, or formatting.`;

  console.log(`[Gemini API] Request started:`);
  console.log(`- Model: ${model}`);
  console.log(`- Endpoint: https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
  console.log(`- Word: "${word}"`);
  console.log(`- Definition: "${definition}"`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      }),
    });

    console.log(`[Gemini API] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[Gemini API] Error Response Payload:`, errorData);
      const errorMessage =
        errorData?.error?.message || `HTTP error! status: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log(`[Gemini API] Success Response Payload:`, data);
    
    const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error('Received empty response structure from Gemini API');
    }

    const trimmedResult = generatedText.trim().replace(/^["']|["']$/g, '');
    console.log(`[Gemini API] Generated Sentence: "${trimmedResult}"`);
    return trimmedResult;
  } catch (error) {
    console.error('[Gemini API] Request failed with exception:', error);
    throw error;
  }
}

/**
 * Tests the Gemini API Key by listing available models.
 * Used for diagnostic purposes.
 *
 * @param apiKey The Google Gemini API Key
 */
export async function testGeminiApiKey(
  apiKey: string
): Promise<{ success: boolean; message: string; models?: string[] }> {
  const cleanKey = apiKey.trim();
  if (cleanKey === '') {
    return { success: false, message: 'Google Gemini API Key is empty. Please enter a key.' };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data?.error?.message || `HTTP ${response.status}`;
      return {
        success: false,
        message: `API connection failed: ${errorMsg}. Make sure your key is valid and the "Generative Language API" is enabled in Google Cloud Console.`,
      };
    }

    const modelsList = data?.models || [];
    const modelNames = modelsList.map((m: any) => m.name.replace('models/', ''));

    if (modelNames.length === 0) {
      return {
        success: false,
        message: 'Connected successfully, but no models are associated with this API key. Make sure the Generative Language API is enabled.',
      };
    }

    return {
      success: true,
      message: `Successfully connected! Your key has access to ${modelNames.length} models.`,
      models: modelNames,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Network/CORS error: ${error?.message || 'Could not connect to Gemini API servers.'}`,
    };
  }
}
