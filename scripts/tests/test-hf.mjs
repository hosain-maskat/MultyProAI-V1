import { client } from "@gradio/client";

async function run() {
  try {
    console.log("Connecting to HF Space...");
    const app = await client("black-forest-labs/FLUX.1-schnell");
    console.log("Connected. Sending predict...");
    const result = await app.predict("/infer", [
        "a flying car in cyberpunk city", 
        Math.floor(Math.random() * 100000), 
        true,       
        1024,       
        1024,       
        4,          
    ]);
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
