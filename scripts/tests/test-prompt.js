const { GoogleGenAI } = require("@google/genai");

async function testPrompt(query) {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenAI({ apiKey });
  
  const prompt = `Analyze this user request: "${query}". 
  If the MAIN subject of the request is a REAL existing PLACE, BUILDING, or UNIVERSITY (like 'Daffodil International University'), you MUST return a DuckDuckGo search query for that place (append 'campus building high quality photo'), EVEN IF the user uses words like 'create' or 'generate'.
  HOWEVER, if the main subject is a SPECIFIC PERSON, CHARACTER, or IMAGINARY SCENE (e.g., 'Md. Shoaib Khan', 'a flying car', 'a boy studying'), return the exact word: GENERATE_AI.
  Return ONLY the search query string OR 'GENERATE_AI'.`;

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    console.log(`Query: "${query}" =>`, response.text?.trim());
  } catch(e) {
    console.log(`Error:`, e.message);
  }
}

async function run() {
  await testPrompt("create daffodil international university image.");
  await testPrompt("create Md. Shoaib khan who is dafodil international university student. create his image.");
}

run();
