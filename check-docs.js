const https = require('https');

https.get('https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const vMatch = data.match(/wss:\/\/generativelanguage\.googleapis\.com\/ws\/google\.ai\.generativelanguage\.(v1[a-z]+)\.GenerativeService\.BidiGenerateContent/);
    console.log('Version:', vMatch ? vMatch[1] : 'None');
    
    const mMatch = data.match(/models\/gemini[^\"\'\\]+/g);
    if (mMatch) {
      console.log('Models:', Array.from(new Set(mMatch)).join(', '));
    }
  });
});
