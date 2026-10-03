/**
 * Foodican YouTube content updater
 *
 * Supports:
 *   - YouTube videos
 *   - YouTube Shorts
 *
 * No YouTube API key required.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CHANNEL_ID =
  process.env.YOUTUBE_CHANNEL_ID ||
  'UCE6VXOmQeNKBqVspyX5qoWA';

const HANDLE =
  process.env.YOUTUBE_HANDLE ||
  '@thefoodican';

const MAX_ITEMS =
  Number(process.env.MAX_ITEMS || 100);

const MAX_NEW_ITEMS =
  Number(process.env.MAX_NEW_ITEMS || 20);

const root =
  path.join(__dirname, '..');

const outFile =
  path.join(root, 'data', 'content.json');

const channelUrl =
  `https://www.youtube.com/channel/${CHANNEL_ID}`;

const uploadsPlaylistId =
  CHANNEL_ID.replace(/^UC/, 'UU');

const uploadsUrl =
  `https://www.youtube.com/playlist?list=${uploadsPlaylistId}`;

function runYtDlp(args) {
  try {
    return execFileSync('yt-dlp', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 100 * 1024 * 1024
    });
  } catch (err) {
    const stderr = err.stderr
      ? err.stderr.toString()
      : '';

    throw new Error(
      `yt-dlp failed:\n${stderr || err.message}`
    );
  }
}

function loadExisting() {
  if (!fs.existsSync(outFile)) {
    return {
      generatedAt: null,
      source: {},
      items: []
    };
  }

  return JSON.parse(
    fs.readFileSync(outFile, 'utf8')
  );
}

function score(text, words) {
  let result = 0;

  for (const word of words) {
    if (text.includes(word)) {
      result++;
    }
  }

  return result;
}

function classify(title, description, tags = []) {
  const text = [
    title,
    description,
    ...tags
  ]
    .join(' ')
    .toLowerCase();

  const food =
    score(text, [
      'food',
      'restaurant',
      'eat',
      'eating',
      'chef',
      'pizza',
      'ramen',
      'sushi',
      'burger',
      'taco',
      'bbq',
      'coffee',
      'cafe',
      'bakery',
      'dim sum',
      'noodle',
      'steak',
      'brunch',
      'dessert',
      'dining',
      'lunch',
      'dinner',
      'foodie',
      'michelin',
      'boba',
      'hot pot',
      'korean bbq',
      'chinese food',
      'japanese food',
      'thai food',
      'vietnamese',
      'mexican food'
    ]);

  const tech =
    score(text, [
      'iphone',
      'ipad',
      'android',
      'apple',
      'google',
      'ai',
      'tech',
      'technology',
      'gadget',
      'phone',
      'smartphone',
      'laptop',
      'computer',
      'camera',
      'app',
      'software',
      'robot',
      'smart home',
      'device',
      'tesla',
      'amazon',
      'wifi',
      'wireless',
      'gaming',
      'macbook',
      'windows',
      'chatgpt',
      'openai',
      'claude',
      'gemini'
    ]);

  if (food >= 2 && food > tech) {
    return 'food';
  }

  if (tech >= 2) {
    return 'tech';
  }

  return 'life';
}

function extractLocation(title, description) {
  const text =
    `${title} ${description}`;

  const cityState =
    text.match(
      /\b([A-Z][a-zA-Z .'-]{2,30}),\s*(TX|CA|NY|FL|AZ|NV|WA|IL|CO|GA|NC|VA|NJ|PA|MA|TN|OH|MI|OR|UT|OK|MO|MN|WI|MD|DC)\b/
    );

  if (cityState) {
    return `${cityState[1].trim()}, ${cityState[2]}`;
  }

  const places = [
    'Dallas',
    'Frisco',
    'Plano',
    'McKinney',
    'Allen',
    'Richardson',
    'Fort Worth',
    'Austin',
    'Houston',
    'San Antonio',
    'Los Angeles',
    'San Francisco',
    'New York',
    'Las Vegas',
    'Chicago',
    'Seattle',
    'Miami',
    'Boston',
    'Atlanta',
    'Denver',
    'Phoenix',
    'San Diego',
    'Nashville'
  ];

  for (const place of places) {
    if (
      text.toLowerCase().includes(
        place.toLowerCase()
      )
    ) {
      return place;
    }
  }

  return '';
}

/*
 * IMPORTANT:
 *
 * We intentionally DO NOT use --flat-playlist here.
 *
 * We want yt-dlp to give us the actual video/Short
 * URLs and enough information to identify them.
 */
function discoverVideos() {
  console.log(
    `Discovering Foodican uploads...`
  );

  const output =
    runYtDlp([
      '--dump-single-json',
      '--skip-download',
      '--no-warnings',
      '--playlist-end',
      String(MAX_ITEMS),
      uploadsUrl
    ]);

  const playlist =
    JSON.parse(output);

  const entries =
    Array.isArray(playlist.entries)
      ? playlist.entries
      : [];

  console.log(
    `YouTube returned ${entries.length} uploads.`
  );

  return entries
    .filter(entry =>
      entry &&
      entry.id
    )
    .map(entry => {
      const url =
        entry.url ||
        entry.webpage_url ||
        `https://www.youtube.com/watch?v=${entry.id}`;

      return {
        id: entry.id,
        url
      };
    });
}

function getVideo(id, discoveredUrl) {
  /*
   * Prefer a Shorts URL when yt-dlp discovered one.
   */
  const url =
    discoveredUrl.includes('/shorts/')
      ? discoveredUrl
      : `https://www.youtube.com/watch?v=${id}`;

  console.log(
    `Extracting: ${url}`
  );

  const output =
    runYtDlp([
      '--dump-single-json',
      '--skip-download',
      '--no-warnings',
      url
    ]);

  return JSON.parse(output);
}

function convertVideo(info, discoveredUrl) {
  const title =
    info.title || '';

  const description =
    info.description || '';

  const tags =
    Array.isArray(info.tags)
      ? info.tags.slice(0, 20)
      : [];

  let publishedAt = '';

  if (info.upload_date) {
    publishedAt =
      `${info.upload_date.slice(0, 4)}-` +
      `${info.upload_date.slice(4, 6)}-` +
      `${info.upload_date.slice(6, 8)}` +
      `T00:00:00Z`;
  } else if (info.timestamp) {
    publishedAt =
      new Date(
        info.timestamp * 1000
      ).toISOString();
  }

  const duration =
    Number(info.duration || 0);

  /*
   * YouTube/yt-dlp can explicitly tell us this is a
   * Short. Duration is only the fallback.
   */
  const isShort =
    discoveredUrl.includes('/shorts/') ||
    info.webpage_url?.includes('/shorts/') ||
    info.original_url?.includes('/shorts/') ||
    (
      duration > 0 &&
      duration <= 60
    );

  const url =
    isShort
      ? `https://www.youtube.com/shorts/${info.id}`
      : `https://www.youtube.com/watch?v=${info.id}`;

  return {
    id: info.id,

    title,

    description,

    category:
      classify(
        title,
        description,
        tags
      ),

    publishedAt,

    url,

    thumbnail:
      info.thumbnail ||
      `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,

    location:
      extractLocation(
        title,
        description
      ),

    duration,

    isShort,

    type:
      isShort
        ? 'short'
        : 'video',

    channel:
      info.channel ||
      info.uploader ||
      '',

    channelId:
      info.channel_id ||
      CHANNEL_ID,

    viewCount:
      Number(info.view_count || 0),

    likeCount:
      Number(info.like_count || 0),

    tags
  };
}

function normalize(item) {
  return {
    id: item.id || '',
    title: item.title || '',
    description: item.description || '',
    category: item.category || 'life',
    publishedAt: item.publishedAt || '',
    url: item.url || '',
    thumbnail: item.thumbnail || '',
    location: item.location || '',
    duration: Number(item.duration || 0),
    isShort: Boolean(item.isShort),
    type:
      item.type ||
      (
        item.isShort
          ? 'short'
          : 'video'
      ),
    channel:
      item.channel || '',
    channelId:
      item.channelId || CHANNEL_ID,
    viewCount:
      Number(item.viewCount || 0),
    likeCount:
      Number(item.likeCount || 0),
    tags:
      Array.isArray(item.tags)
        ? item.tags
        : []
  };
}

async function main() {
  console.log('');
  console.log('======================================');
  console.log('FOODICAN YOUTUBE UPDATER');
  console.log('======================================');
  console.log('');

  const existing =
    loadExisting();

  const existingItems =
    Array.isArray(existing.items)
      ? existing.items.map(normalize)
      : [];

  const existingIds =
    new Set(
      existingItems.map(
        item => item.id
      )
    );

  console.log(
    `Existing site items: ${existingItems.length}`
  );

  /*
   * Discover uploads.
   */
  const discovered =
    discoverVideos();

  if (!discovered.length) {
    throw new Error(
      'YouTube returned zero uploads. Existing content was preserved.'
    );
  }

  /*
   * Only process videos we haven't already stored.
   */
  const newVideos =
    discovered
      .filter(video =>
        !existingIds.has(video.id)
      )
      .slice(
        0,
        MAX_NEW_ITEMS
      );

  console.log(
    `New uploads: ${newVideos.length}`
  );

  const newItems = [];

  for (const video of newVideos) {
    try {
      const info =
        getVideo(
          video.id,
          video.url
        );

      const item =
        normalize(
          convertVideo(
            info,
            video.url
          )
        );

      if (
        item.id &&
        item.title &&
        item.url
      ) {
        newItems.push(item);
      }

    } catch (err) {
      console.warn(
        `Failed to process ${video.id}:`
      );

      console.warn(
        err.message
      );
    }
  }

  /*
   * Merge without deleting anything already on
   * the website.
   */
  const merged =
    [
      ...newItems,
      ...existingItems
    ];

  const unique =
    Array.from(
      new Map(
        merged.map(item => [
          item.id,
          item
        ])
      ).values()
    );

  const items =
    unique
      .filter(item =>
        item.id &&
        item.title &&
        item.url
      )
      .sort(
        (a, b) =>
          new Date(
            b.publishedAt || 0
          ) -
          new Date(
            a.publishedAt || 0
          )
      )
      .slice(
        0,
        MAX_ITEMS
      );

  /*
   * Never replace an established content file with
   * a suspiciously empty result.
   */
  if (
    existingItems.length > 0 &&
    items.length === 0
  ) {
    throw new Error(
      'Safety check failed: generated zero items. Existing content was preserved.'
    );
  }

  const payload = {
    generatedAt:
      new Date().toISOString(),

    source: {
      platform: 'youtube',
      handle: HANDLE,
      channelId: CHANNEL_ID,
      channelUrl,
      uploadsPlaylistId,
      uploadsUrl
    },

    itemCount:
      items.length,

    items
  };

  fs.mkdirSync(
    path.dirname(outFile),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    outFile,
    JSON.stringify(
      payload,
      null,
      2
    ) + '\n'
  );

  console.log('');
  console.log('======================================');
  console.log('UPDATE COMPLETE');
  console.log(`Previously stored: ${existingItems.length}`);
  console.log(`New videos:        ${newItems.length}`);
  console.log(`Total stored:      ${items.length}`);
  console.log('======================================');
}

main().catch(error => {
  console.error('');
  console.error(
    'FOODICAN UPDATE FAILED'
  );
  console.error(
    error.message
  );
  console.error('');

  process.exit(1);
});