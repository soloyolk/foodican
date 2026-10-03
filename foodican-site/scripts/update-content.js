/**
 * Foodican content updater.
 *
 * It discovers the YouTube channel ID from the public @thefoodican channel page,
 * then reads the public YouTube Atom feed and writes data/content.json.
 * No YouTube API key is required for this RSS/Atom approach.
 *
 * Optional env vars:
 *   YOUTUBE_HANDLE   default: @thefoodican
 *   MAX_ITEMS        default: 30
 */
const fs = require('fs');
const path = require('path');

const handle = process.env.YOUTUBE_HANDLE || '@thefoodican';
const maxItems = Number(process.env.MAX_ITEMS || 30);
const root = path.join(__dirname, '..');
const outFile = path.join(root, 'data', 'content.json');

async function getText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'FoodicanBot/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function firstMatch(text, regexes) {
  for (const re of regexes) { const m = text.match(re); if (m) return m[1]; }
  return null;
}

function cleanHtml(s='') { return s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }
function xmlUnescape(s='') { return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
function tag(xml, name) { const m=xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`)); return m?xmlUnescape(cleanHtml(m[1])):''; }
function atomEntries(xml) { return xml.split(/<entry>/).slice(1).map(x=>`<entry>${x.split('</entry>')[0]}</entry>`); }
function entryLink(x){ const m=x.match(/<link[^>]+href="([^"]+)"[^>]*\/>/); return m?m[1]:''; }
function entryThumb(x){ const m=x.match(/<media:thumbnail[^>]+url="([^"]+)"/); return m?m[1]:''; }
function classify(title, desc){
  const s=(title+' '+desc).toLowerCase();
  if(/restaurant|food|eat|eating|chef|recipe|pizza|ramen|sushi|burger|taco|bbq|coffee|cafe|bakery|dim sum|noodle/.test(s)) return 'food';
  if(/iphone|android|apple|google|ai|tech|gadget|phone|laptop|computer|camera|app|software|robot|smart home|device/.test(s)) return 'tech';
  return 'life';
}

async function main(){
  const channelPage = await getText(`https://www.youtube.com/${handle}`);
  const channelId = firstMatch(channelPage,[
    /<meta[^>]+itemprop="channelId"[^>]+content="([^"]+)"/i,
    /"channelId":"([^"]+)"/i,
    /"externalId":"([^"]+)"/i
  ]);
  if(!channelId) throw new Error('Could not discover YouTube channel ID. Set YOUTUBE_CHANNEL_ID in the workflow environment.');
  const feed = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  const items=atomEntries(feed).map(x=>{
    const title=tag(x,'title');
    const description=tag(x,'media:description')||tag(x,'description');
    const published=tag(x,'published');
    const videoId=tag(x,'yt:videoId');
    return {id:videoId||title,title,description,category:classify(title,description),publishedAt:published,url:videoId?`https://www.youtube.com/watch?v=${videoId}`:entryLink(x),thumbnail:entryThumb(x),location:''};
  }).filter(x=>x.title).slice(0,maxItems);
  const payload={generatedAt:new Date().toISOString(),items};
  fs.writeFileSync(outFile,JSON.stringify(payload,null,2)+'\n');
  console.log(`Updated ${items.length} YouTube items.`);
}

main().catch(err=>{console.error(err);process.exit(1);});
