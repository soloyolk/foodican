/**
 * Foodican YouTube content updater
 *
 * Uses YouTube's public Atom channel feed.
 *
 * Advantages:
 *   - No YouTube API key
 *   - No yt-dlp
 *   - No YouTube login
 *   - No cookies
 *   - Works from GitHub Actions
 *   - Works with YouTube Shorts
 *
 * The YouTube feed contains the channel's most recent
 * uploads. Existing content is preserved so the site can
 * accumulate older posts over time.
 */

const fs = require('fs');
const path = require('path');

const CHANNEL_ID =
  process.env.YOUTUBE_CHANNEL_ID ||
  'UCE6VXOmQeNKBqVspyX5qoWA';

const HANDLE =
  process.env.YOUTUBE_HANDLE ||
  '@thefoodican';

const MAX_ITEMS =
  Number(process.env.MAX_ITEMS || 100);

const root =
  path.join(__dirname, '..');

const outFile =
  path.join(root, 'data', 'content.json');

const feedUrl =
  `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

const channelUrl =
  `https://www.youtube.com/channel/${CHANNEL_ID}`;


/*
 * ---------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------
 */

function decodeXml(value) {
  if (!value) {
    return '';
  }

  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function stripHtml(value) {
  return decodeXml(
    String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
}

function getTag(block, tagName) {
  const regex =
    new RegExp(
      `<${escapeRegex(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegex(tagName)}>`,
      'i'
    );

  const match =
    block.match(regex);

  return match
    ? decodeXml(match[1].trim())
    : '';
}

function getAttribute(
  block,
  tagName,
  attribute
) {
  const regex =
    new RegExp(
      `<${escapeRegex(tagName)}[^>]*\\s${escapeRegex(attribute)}=["']([^"']+)["']`,
      'i'
    );

  const match =
    block.match(regex);

  return match
    ? decodeXml(match[1])
    : '';
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


/*
 * ---------------------------------------------------------
 * Content classification
 * ---------------------------------------------------------
 */

function classify(
  title,
  description
) {
  const text =
    `${title} ${description}`
      .toLowerCase();

  const foodScore =
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
      'gemini'
    ]);

  if (
    foodScore >= 2 &&
    foodScore > techScore
  ) {
    return 'food';
  }

  if (techScore >= 2) {
    return 'tech';
  }

  return 'life';
}


/*
 * ---------------------------------------------------------
 * Location detection
 * ---------------------------------------------------------
 */

function extractLocation(
  title,
  description
) {
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
      text
        .toLowerCase()
        .includes(
          place.toLowerCase()
        )
    ) {
      return place;
    }
  }

  return '';
}


/*
 * ---------------------------------------------------------
 * Shorts detection
 *
 * The public Atom feed does not reliably expose duration,
 * so we use explicit Shorts markers when available.
 *
 * This includes:
 *   #shorts
 *   #short
 *   youtube.com/shorts/
 *
 * If a Short doesn't have a marker, it still gets added
 * to the site — it simply won't receive the SHORT badge.
 * ---------------------------------------------------------
 */

function detectShort(
  title,
  description,
  url
) {
  const text =
    `${title} ${description}`
      .toLowerCase();

  return (
    text.includes('#shorts') ||
    text.includes('#short ') ||
    text.endsWith('#short') ||
    String(url)
      .toLowerCase()
      .includes('/shorts/')
  );
}


/*
 * ---------------------------------------------------------
 * Fetch YouTube feed
 * ---------------------------------------------------------
 */

async function fetchFeed() {
  console.log('');
  console.log(
    `Fetching YouTube feed:`
  );
  console.log(feedUrl);
  console.log('');

  const response =
    await fetch(feedUrl, {
      headers: {
        'User-Agent':
          'Foodican GitHub Action/1.0'
      }
    });

  if (!response.ok) {
    throw new Error(
      `YouTube feed returned HTTP ${response.status}`
    );
  }

  return response.text();
}


/*
 * ---------------------------------------------------------
 * Parse Atom feed
 * ---------------------------------------------------------
 */

function parseFeed(xml) {
  const entries = [];

  const matches =
    xml.match(
      /<entry[\s\S]*?<\/entry>/gi
    ) || [];

  for (const entry of matches) {
    const videoId =
      getTag(
        entry,
        'yt:videoId'
      );

    const title =
      stripHtml(
        getTag(
          entry,
          'title'
        )
      );

    const published =
      getTag(
        entry,
        'published'
      );

    const updated =
      getTag(
        entry,
        'updated'
      );

    const thumbnail =
      getAttribute(
        entry,
        'media:thumbnail',
        'url'
      );

    const description =
      stripHtml(
        getTag(
          entry,
          'media:description'
        )
      );

    const link =
      getAttribute(
        entry,
        'link',
        'href'
      ) ||
      (
        videoId
          ? `https://www.youtube.com/watch?v=${videoId}`
          : ''
      );

    const author =
      stripHtml(
        getTag(
          entry,
          'name'
        )
      );

    if (
      !videoId ||
      !title
    ) {
      continue;
    }

    const isShort =
      detectShort(
        title,
        description,
        link
      );

    entries.push({
      id: videoId,

      title,

      description,

      publishedAt:
        published ||
        updated ||
        '',

      url:
        isShort
          ? `https://www.youtube.com/shorts/${videoId}`
          : `https://www.youtube.com/watch?v=${videoId}`,

      thumbnail:
        thumbnail ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,

      category:
        classify(
          title,
          description
        ),

      location:
        extractLocation(
          title,
          description
        ),

      isShort,

      type:
        isShort
          ? 'short'
          : 'video',

      channel:
        author ||
        'Foodican',

      channelId:
        CHANNEL_ID,

      duration: 0,

      viewCount: 0,

      likeCount: 0,

      tags: []
    });
  }

  return entries;
}


/*
 * ---------------------------------------------------------
 * Load existing content
 * ---------------------------------------------------------
 */

function loadExisting() {
  if (
    !fs.existsSync(outFile)
  ) {
    return {
      generatedAt: null,

      source: {
        platform: 'youtube',
        handle: HANDLE,
        channelId: CHANNEL_ID,
        channelUrl,
        feedUrl
      },

      items: []
    };
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        outFile,
        'utf8'
      )
    );
  } catch (error) {
    throw new Error(
      `Could not read existing content.json: ${error.message}`
    );
  }
}


/*
 * ---------------------------------------------------------
 * Normalize old/new items
 * ---------------------------------------------------------
 */

function normalize(item) {
  return {
    id:
      item.id || '',

    title:
      item.title || '',

    description:
      item.description || '',

    category:
      item.category || 'life',

    publishedAt:
      item.publishedAt || '',

    url:
      item.url || '',

    thumbnail:
      item.thumbnail || '',

    location:
      item.location || '',

    duration:
      Number(
        item.duration || 0
      ),

    isShort:
      Boolean(
        item.isShort
      ),

    type:
      item.type ||
      (
        item.isShort
          ? 'short'
          : 'video'
      ),

    channel:
      item.channel ||
      'Foodican',

    channelId:
      item.channelId ||
      CHANNEL_ID,

    viewCount:
      Number(
        item.viewCount || 0
      ),

    likeCount:
      Number(
        item.likeCount || 0
      ),

    tags:
      Array.isArray(item.tags)
        ? item.tags
        : []
  };
}


/*
 * ---------------------------------------------------------
 * Main
 * ---------------------------------------------------------
 */

async function main() {
  console.log('');
  console.log(
    '========================================'
  );
  console.log(
    'FOODICAN YOUTUBE FEED UPDATER'
  );
  console.log(
    '========================================'
  );
  console.log('');

  const existing =
    loadExisting();

  const existingItems =
    Array.isArray(existing.items)
      ? existing.items.map(normalize)
      : [];

  console.log(
    `Existing site items: ${existingItems.length}`
  );

  /*
   * Fetch public YouTube feed.
   */
  const xml =
    await fetchFeed();

  /*
   * Parse uploads.
   */
  const feedItems =
    parseFeed(xml);

  console.log(
    `YouTube feed items: ${feedItems.length}`
  );

  if (
    feedItems.length === 0
  ) {
    throw new Error(
      'YouTube returned zero feed items. Existing content was NOT changed.'
    );
  }

  /*
   * Merge feed with existing content.
   *
   * The feed only contains the latest uploads, so this
   * allows the GitHub repository to retain older videos.
   */
  const merged =
    [
      ...feedItems,
      ...existingItems
    ];

  /*
   * Remove duplicate video IDs.
   */
  const unique =
    Array.from(
      new Map(
        merged.map(item => [
          item.id,
          item
        ])
      ).values()
    );

  /*
   * Sort newest first.
   */
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
   * Safety check.
   */
  if (
    existingItems.length > 0 &&
    items.length === 0
  ) {
    throw new Error(
      'Safety check failed: zero valid items were generated. Existing content was NOT changed.'
    );
  }

  const payload = {
    generatedAt:
      new Date().toISOString(),

    source: {
      platform: 'youtube',

      handle:
        HANDLE,

      channelId:
        CHANNEL_ID,

      channelUrl,

      feedUrl
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
  console.log(
    '========================================'
  );
  console.log(
    'UPDATE COMPLETE'
  );
  console.log(
    `Feed items:        ${feedItems.length}`
  );
  console.log(
    `Previously stored: ${existingItems.length}`
  );
  console.log(
    `Total stored:      ${items.length}`
  );
  console.log(
    `Output:            ${outFile}`
  );
  console.log(
    '========================================'
  );
}

main().catch(error => {
  console.error('');
  console.error(
    'FOODICAN UPDATE FAILED'
  );
  console.error('');
  console.error(
    error.message
  );
  console.error('');

  process.exit(1);
});