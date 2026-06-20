import { generateImage } from "./src/services/imageGenerator.js";
import { config } from "dotenv";

config();

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API Key found");
    return;
  }
  
  console.log("Testing generateImage...");
  const result = await generateImage("daffodil international university photo", apiKey);
  console.log("\n--- RESULT ---\n");
  console.log(result);
  console.log("\n--------------\n");
}

test();
