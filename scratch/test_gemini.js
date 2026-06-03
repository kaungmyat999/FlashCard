const apiKey = process.argv[2];
if (!apiKey) {
  console.error("Please provide your Google Gemini API Key as an argument:");
  console.error("node test_gemini.js YOUR_API_KEY");
  process.exit(1);
}

const model = 'gemini-2.5-flash';
const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

const prompt = `Generate a single example sentence using the word "Ephemeral".`;

console.log(`Calling Gemini API using model: ${model}...`);
console.log(`URL: https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=***`);

try {
  // Use global fetch available in Node v18+
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
        maxOutputTokens: 100,
      },
    }),
  });

  console.log(`Status Code: ${response.status} ${response.statusText}`);
  const data = await response.json();
  
  if (!response.ok) {
    console.error("Error Response from Gemini API:", JSON.stringify(data, null, 2));
  } else {
    console.log("Success! Response text:");
    console.log(data?.candidates?.[0]?.content?.parts?.[0]?.text);
  }
} catch (error) {
  console.error("Fetch request failed:", error);
}
