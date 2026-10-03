```js
/**
 * Foodican content updater
 *
 * Uses yt-dlp to resolve @thefoodican and retrieve the public
 * YouTube video library. No YouTube API key required.
 *
 * Environment variables:
 *   YOUTUBE_HANDLE   default: @thefoodican
 *   MAX_ITEMS        default: 100
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const handle = process.env.YOUTUBE_HANDLE || '@thefoodican';
const maxItems = Number(process.env.MAX_ITEMS || 100);

const root = path.join(__dirname, '..');
const outFile = path.join(root, 'data', 'content.json');

function classify(title, desc) {
  const s = `${title} ${desc}`.toLowerCase();

  if (
    /restaurant|food|eat|eating|chef|recipe|pizza|ramen|sushi|burger|taco|bbq|coffee|cafe|bakery|dim sum|noodle|steak|brunch|dessert|barbecue|dining|meal|lunch|dinner/.test(s)
  ) {
    return 'food';
  }

  if (
    /iphone|android|apple|google|ai|tech|gadget|phone|laptop|computer|camera|app|software|robot|smart home|device|tesla|amazon|wifi|wireless|gaming|technology/.test(s)
  ) {
    return 'tech';
  }

  return 'life';
}

function runYtDlp(args) {
  try {
    return execFileSync('yt-dlp', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    throw new Error(
      `yt-dlp failed.\n${stderr || err.message}`
    );
  }
}

function resolveChannel() {
  const url = `https://www.youtube.com/${handle}`;

  console.log(`Resolving YouTube channel: ${handle}`);

  const output = runYtDlp([
    '--skip-download',
    '--dump-single-json',
    '--flat-playlist',
    '--playlist-end',
    '1',
    url
  ]);

  const info = JSON.parse(output);

  const channelId =
    info.channel_id ||
    info.uploader_id ||
    '';

  if (!/^UC[\w-]{20,}$/.test(channelId)) {
    throw new Error(
      `Could not resolve a valid YouTube channel ID.\n` +
      `yt-dlp returned channel_id=${info.channel_id || 'NA'}, ` +
      `uploader_id=${info.uploader_id || 'NA'}`
    );
  }

  console.log(`Resolved channel ID: ${channelId}`);

  return {
    channelId,
    channelUrl:
      info.channel_url ||
      `https://www.youtube.com/channel/${channelId}`
  };
}

function getVideos(channelUrl) {
  console.log(`Retrieving YouTube videos...`);

  /*
   * --flat-playlist makes this much faster because we first retrieve
   * the list of videos without downloading each video's webpage.
   *
   * We then use --dump-single-json on each video to get its metadata.
   */
  const playlistJson = runYtDlp([
    '--flat-playlist',
    '--dump-single-json',
    '--playlist-end',
    String(maxItems),
    '--no-warnings',
    channelUrl + '/videos'
  ]);

  const playlist = JSON.parse(playlistJson);

  const entries = playlist.entries || [];

  console.log(`Found ${entries.length} videos.`);

  return entries
    .filter(entry => entry && entry.id)
    .slice(0, maxItems);
}

function getVideoMetadata(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const output = runYtDlp([
      '--skip-download',
      '--dump-single-json',
      '--no-warnings',
      url
    ]);

    return JSON.parse(output);
  } catch (err) {
    console.warn(
      `Could not retrieve metadata for ${videoId}: ${err.message}`
    );

    return null;
  }
}

function convertVideo(info) {
  if (!info || !info.id || !info.title) {
    return null;
  }

  const title = info.title || '';
  const description = info.description || '';

  /*
   * YouTube thumbnail fallback.
   *
   * yt-dlp normally provides thumbnail, but using the standard
   * i.ytimg.com URL gives us a reliable fallback.
   */
  const thumbnail =
    info.thumbnail ||
    `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`;

  const publishedAt =
    info.upload_date
      ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}T00:00:00Z`
      : info.timestamp
        ? new Date(info.timestamp * 1000).toISOString()
        : '';

  return {
    id: info.id,
    title,
    description,
    category: classify(title, description),
    publishedAt,
    url: `https://www.youtube.com/watch?v=${info.id}`,
    thumbnail,
    location: '',
    duration: info.duration || 0,
    isShort:
      Boolean(info.duration && info.duration <= 60) ||
      Boolean(info.categories?.includes('Shorts')),
    channel: info.channel || '',
    channelId: info.channel_id || ''
  };
}

async function main() {
  const channel = resolveChannel();

  const entries = getVideos(channel.channelUrl);

  const items = [];

  /*
   * Fetch full metadata for each video.
   *
   * We do this sequentially to avoid hammering YouTube and to keep
   * GitHub Actions reliable.
   */
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    console.log(
      `[${i + 1}/${entries.length}] ${entry.id} ${entry.title || ''}`
    );

    const metadata = getVideoMetadata(entry.id);
    const item = convertVideo(metadata || entry);

    if (item) {
      items.push(item);
    }
  }

  /*
   * Newest videos first.
   */
  items.sort((a, b) => {
    return new Date(b.publishedAt || 0) -
           new Date(a.publishedAt || 0);
  });

  const payload = {
    generatedAt: new Date().toISOString(),

    source: {
      platform: 'youtube',
      handle,
      channelId: channel.channelId,
      channelUrl: channel.channelUrl
    },

    items
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  fs.writeFileSync(
    outFile,
    JSON.stringify(payload, null, 2) + '\n'
  );

  console.log('');
  console.log('========================================');
  console.log(`Foodican content updated.`);
  console.log(`Videos written: ${items.length}`);
  console.log(`Output: ${outFile}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('');
  console.error('Foodican updater failed:');
  console.error(err.message);
  process.exit(1);
});
```
