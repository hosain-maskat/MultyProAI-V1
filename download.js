const fs = require('fs');
const https = require('https');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return download(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  try {
    await download('https://upload.wikimedia.org/wikipedia/en/thumb/6/69/Daffodil_International_University_logo.svg/800px-Daffodil_International_University_logo.svg.png', 'public/diu-logo.png');
    await download('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Daffodil_International_University_Library.jpg/1280px-Daffodil_International_University_Library.jpg', 'public/diu-building.jpg');
    console.log('Downloaded successfully');
  } catch(e) {
    console.error('Error:', e);
  }
}
run();
