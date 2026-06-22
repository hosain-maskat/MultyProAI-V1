const ytSearch = require('yt-search');

async function test() {
  try {
    const r = await ytSearch('nature');
    console.log(r.videos[0].videoId);
  } catch (e) {
    console.error(e);
  }
}
test();
