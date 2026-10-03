/**
 * Foodican content updater
 *
 * Uses yt-dlp to resolve @thefoodican and retrieve public YouTube videos.
 * No YouTube API key required.
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

function runYtDlp(args) {
  try {
    return execFileSync('yt-dlp', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 100 * 1024 * 1024
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';

    throw new Error(
      `yt-dlp failed.\n${stderr || err.message}`
    );
  }
}

function classify(title, description) {
  const text = (title + ' ' + description).toLowerCase();

  if (
    /restaurant|food|eat|eating|chef|recipe|pizza|ramen|sushi|burger|taco|bbq|coffee|cafe|bakery|dim sum|noodle|steak|brunch|dessert|barbecue|dining|meal|lunch|dinner/.test(text)
  ) {
    return 'food';
  }

  if (
    /iphone|android|apple|google|ai|tech|gadget|phone|laptop|computer|camera|app|software|robot|smart home|device|tesla|amazon|wifi|wireless|gaming|technology/.test(text)
  ) {
    return 'tech';
  }

  return 'life';
}

function isValidChannelId(value) {
  return /^UC[\w-]{20,}$/.test(value || '');
}

function resolveChannel() {
  const url = `https://www.youtube.com/${handle}`;

  console.log(`Resolving YouTube handle: ${handle}`);

  const output = runYtDlp([
    '--skip-download',
    '--dump-single-json',
    '--flat-playlist',
    '--playlist-end',
    '1',
    '--no-warnings',
    url
  ]);

  const info = JSON.parse(output);

  const channelId =
    info.channel_id ||
    info.uploader_id ||
    '';

  if (!isValidChannelId(channelId)) {
    throw new Error(
      `Could not resolve ${handle} to a valid YouTube channel ID.\n` +
      `yt-dlp returned channel_id=${info.channel_id || 'NA'}, ` +
      `uploader_id=${info.uploader_id || 'NA'}`
    );
  }

  const channelUrl =
    info.channel_url ||
    `https://www.youtube.com/channel/${channelId}`;

  console.log(`Resolved channel ID: ${channelId}`);
  console.log(`Channel URL: ${channelUrl}`);

  return {
    channelId,
    channelUrl
  };
}

function getVideos(channelUrl) {
  const videosUrl = `${channelUrl}/videos`;

  console.log(`Retrieving videos from: ${videosUrl}`);
  console.log(`Maximum videos: ${maxItems}`);

  /*
   * --dump-json outputs one JSON object per video.
   *
   * We deliberately do NOT use --flat-playlist here because we want
   * the full metadata for each video.
   */
  const output = runYtDlp([
    '--skip-download',
    '--dump-json',
    '--no-warnings',
    '--ignore-errors',
    '--playlist-end',
    String(maxItems),
    videosUrl
  ]);

  const lines = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const videos = [];

  for (const line of lines) {
    try {
      const info = JSON.parse(line);

      if (info && info.id && info.title) {
        videos.push(info);
      }
    } catch (err) {
      console.warn('Skipping invalid yt-dlp output line.');
    }
  }

  console.log(`yt-dlp returned ${videos.length} videos.`);

  return videos;
}

function convertVideo(info) {
  const title = info.title || '';
  const description = info.description || '';

  const publishedAt = info.upload_date
    ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}T00:00:00Z`
    : info.timestamp
      ? new Date(info.timestamp * 1000).toISOString()
      : '';

  const thumbnail =
    info.thumbnail ||
    `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`;

  const duration = Number(info.duration || 0);

  return {
    id: info.id,
    title,
    description,
    category: classify(title, description),
    publishedAt,
    url: `https://www.youtube.com/watch?v=${info.id}`,
    thumbnail,
    location: '',

    // Extra metadata for future Foodican features.
    duration,
    isShort: duration > 0 && duration <= 60,
    channel: info.channel || '',
    channelId: info.channel_id || '',
    viewCount: Number(info.view_count || 0),
    tags: Array.isArray(info.tags) ? info.tags.slice(0, 20) : []
  };
}

async function main() {
  const channel = resolveChannel();

  const videos = getVideos(channel.channelUrl);

  const items = videos
    .map(convertVideo)
    .filter(Boolean)
    .sort((a, b) => {
      return (
        new Date(b.publishedAt || 0) -
        new Date(a.publishedAt || 0)
      );
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

  fs.mkdirSync(path.dirname(outFile), {
    recursive: true
  });

  fs.writeFileSync(
    outFile,
    JSON.stringify(payload, null, 2) + '\n'
  );

  console.log('');
  console.log('========================================');
  console.log('Foodican content update complete');
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
