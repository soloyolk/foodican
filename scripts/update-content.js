/**
 * Foodican YouTube → content.json updater
 *
 * Architecture:
 *   YouTube channel
 *      ↓
 *   uploads playlist (UU + channel ID)
 *      ↓
 *   yt-dlp
 *      ↓
 *   data/content.json
 *
 * No YouTube API key required.
 *
 * Environment variables:
 *   YOUTUBE_CHANNEL_ID   default: UCE6VXOmQeNKBqVspyX5qoWA
 *   YOUTUBE_HANDLE       default: @thefoodican
 *   MAX_ITEMS            default: 100
 *   MAX_NEW_ITEMS        default: 20
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
      `yt-dlp failed.\n${stderr || err.message}`
    );
  }
}

function loadExisting() {
  if (!fs.existsSync(outFile)) {
    return {
      generatedAt: null,
      source: {
        platform: 'youtube',
        handle: HANDLE,
        channelId: CHANNEL_ID,
        channelUrl
      },
      items: []
    };
  }

  try {
    return JSON.parse(
      fs.readFileSync(outFile, 'utf8')
    );
  } catch (err) {
    throw new Error(
      `Existing content.json is invalid: ${err.message}`
    );
  }
}

function classify(title, description, tags = []) {
  const text = [
    title,
    description,
    ...tags
  ]
    .join(' ')
    .toLowerCase();

  const foodScore =
    score(text, [
      'restaurant',
      'food',
      'eat',
      'eating',
      'chef',
      'recipe',
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
      'barbecue',
      'dining',
      'meal',
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

  const techScore =
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
      'gemini',
      'home automation'
    ]);

  if (foodScore > techScore && foodScore >= 2) {
    return 'food';
  }

  if (techScore >= 2) {
    return 'tech';
  }

  return 'life';
}

function score(text, words) {
  let total = 0;

  for (const word of words) {
    if (text.includes(word)) {
      total++;
    }
  }

  return total;
}

function extractLocation(title, description) {
  const text =
    `${title} ${description}`;

  /*
   * Common "in CITY", "at CITY", and
   * "CITY, STATE" patterns.
   */

  const cityState =
    text.match(
      /\b([A-Z][a-zA-Z .'-]{2,30}),\s*(TX|CA|NY|FL|AZ|NV|WA|IL|CO|GA|NC|VA|NJ|PA|MA|TN|OH|MI|OR|UT|OK|MO|MN|WI|MD|DC)\b/
    );

  if (cityState) {
    return `${cityState[1].trim()}, ${cityState[2]}`;
  }

  const knownPlaces = [
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
    'Orange County',
    'Nashville',
    'Washington DC'
  ];

  for (const place of knownPlaces) {
    if (
      new RegExp(
        `\\b${escapeRegex(place)}\\b`,
        'i'
      ).test(text)
    ) {
      return place;
    }
  }

  return '';
}

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
}

function getUploads() {
  console.log(
    `Reading uploads playlist: ${uploadsUrl}`
  );

  const output = runYtDlp([
    '--flat-playlist',
    '--dump-single-json',
    '--skip-download',
    '--no-warnings',
    '--playlist-end',
    String(MAX_ITEMS),
    uploadsUrl
  ]);

  const info = JSON.parse(output);

  const entries =
    Array.isArray(info.entries)
      ? info.entries
      : [];

  return entries
    .filter(entry =>
      entry &&
      entry.id
    )
    .map(entry => ({
      id: entry.id,
      title: entry.title || '',
      url:
        `https://www.youtube.com/watch?v=${entry.id}`
    }));
}

function getVideo(videoId) {
  console.log(
    `Fetching metadata: ${videoId}`
  );

  const output = runYtDlp([
    '--dump-single-json',
    '--skip-download',
    '--no-warnings',
    `https://www.youtube.com/watch?v=${videoId}`
  ]);

  return JSON.parse(output);
}

function convertVideo(info) {
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

  const isShort =
    duration > 0 &&
    duration <= 60;

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

    url:
      `https://www.youtube.com/watch?v=${info.id}`,

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

    tags,

    type:
      isShort
        ? 'short'
        : 'video'
  };
}

function normalizeItem(item) {
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
    channel: item.channel || '',
    channelId: item.channelId || CHANNEL_ID,
    viewCount: Number(item.viewCount || 0),
    likeCount: Number(item.likeCount || 0),
    tags: Array.isArray(item.tags)
      ? item.tags
      : [],
    type:
      item.type ||
      (item.isShort ? 'short' : 'video')
  };
}

function validateItems(items) {
  return items.filter(item => {
    if (!item.id) return false;
    if (!item.title) return false;
    if (!/^https:\/\/www\.youtube\.com\/watch\?v=/.test(item.url)) {
      return false;
    }

    return true;
  });
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('Foodican YouTube content updater');
  console.log('========================================');
  console.log('');

  const existing =
    loadExisting();

  const existingItems =
    Array.isArray(existing.items)
      ? existing.items.map(normalizeItem)
      : [];

  console.log(
    `Existing items: ${existingItems.length}`
  );

  /*
   * Step 1:
   * Get the current upload list.
   *
   * This is intentionally separate from fetching
   * full video metadata.
   */
  const uploads =
    getUploads();

  if (!uploads.length) {
    throw new Error(
      'YouTube returned zero uploads. Existing content was NOT changed.'
    );
  }

  console.log(
    `Uploads discovered: ${uploads.length}`
  );

  /*
   * Step 2:
   * Only retrieve full metadata for videos we don't
   * already have.
   */
  const existingIds =
    new Set(
      existingItems.map(item => item.id)
    );

  const newUploads =
    uploads
      .filter(video =>
        !existingIds.has(video.id)
      )
      .slice(0, MAX_NEW_ITEMS);

  console.log(
    `New videos requiring metadata: ${newUploads.length}`
  );

  const newItems = [];

  for (const video of newUploads) {
    try {
      const info =
        getVideo(video.id);

      const item =
        normalizeItem(
          convertVideo(info)
        );

      if (item.id) {
        newItems.push(item);
      }
    } catch (err) {
      console.warn(
        `Could not retrieve ${video.id}: ${err.message}`
      );
    }
  }

  /*
   * Step 3:
   * Preserve everything already in the site.
   *
   * New videos are prepended.
   */
  const merged = [
    ...newItems,
    ...existingItems
  ];

  const deduped =
    Array.from(
      new Map(
        merged.map(item => [
          item.id,
          item
        ])
      ).values()
    );

  const valid =
    validateItems(deduped)
      .sort((a, b) =>
        new Date(b.publishedAt || 0) -
        new Date(a.publishedAt || 0)
      )
      .slice(0, MAX_ITEMS);

  /*
   * Safety check:
   *
   * If YouTube suddenly gives us a tiny result compared
   * with what we already know, do not wipe the site.
   */
  if (
    existingItems.length >= 10 &&
    valid.length < Math.min(
      5,
      existingItems.length * 0.25
    )
  ) {
    throw new Error(
      `Safety check failed: existing=${existingItems.length}, new=${valid.length}. Existing content was NOT changed.`
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
      valid.length,

    items:
      valid
  };

  fs.mkdirSync(
    path.dirname(outFile),
    { recursive: true }
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
  console.log('========================================');
  console.log('Foodican content update complete');
  console.log(`Existing: ${existingItems.length}`);
  console.log(`New: ${newItems.length}`);
  console.log(`Total: ${valid.length}`);
  console.log(`Output: ${outFile}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('');
  console.error('Foodican updater failed:');
  console.error(err.message);
  console.error('');
  process.exit(1);
});