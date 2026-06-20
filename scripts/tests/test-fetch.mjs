import { client } from "@gradio/client";

async function run() {
  try {
    const app = await client("black-forest-labs/FLUX.1-schnell");
    const result = await app.predict("/infer", [
        "a flying car", 
        Math.floor(Math.random() * 100000), 
        true,       
        1024,       
        1024,       
        4,          
    ]);
    const url = result.data[0].url;
    console.log("Got URL:", url);
    const res = await fetch(url);
    console.log("Fetch status:", res.status);
    const buffer = await res.arrayBuffer();
    console.log("Buffer size:", buffer.byteLength);
  } catch(e) {
    console.error(e);
  }
}
run();
