const { GoogleGenAI } = require("@google/genai");

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenAI({ apiKey });

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            data: "UEsDBBQABgAIAAAAIQAAAAAAAAAAAAAAAAAAAAA=" // dummy empty zip/pptx
          }
        },
        "What is in this presentation?"
      ]
    });
    console.log("Success:", response.text);
  } catch(e) {
    console.log("Error:", e.message);
  }
}
test();
