const q = "nature";
fetch(`https://www.youtube.com/results?search_query=${q}`)
  .then(res => res.text())
  .then(text => {
    const match = text.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (match) console.log("FOUND:", match[1]);
    else console.log("Not found");
  })
  .catch(console.error);
