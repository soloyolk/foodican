# Foodican.com

A lightweight, GitHub Pages-ready website for Foodican.

## What this does

- Static site: no WordPress, database, or paid hosting required.
- Uses the Foodican logo in `assets/Foodican_Logo.png`.
- Automatically pulls the latest YouTube uploads into `data/content.json` every 6 hours.
- Automatically categorizes posts into Food / Tech / Life using simple keyword rules.
- GitHub Pages deploys the site whenever `main` changes.
- `CNAME` is already set to `foodican.com`.

## One-time GitHub setup

1. Create a **public** GitHub repository named `foodican` (or another name you prefer).
2. Upload the contents of this folder to the repository's `main` branch.
3. In GitHub, open **Settings → Pages**.
4. Under the build/deployment source, choose **GitHub Actions**.
5. Push to `main` or manually run **Deploy Foodican** under Actions.
6. Keep `foodican.com` in the repository's `CNAME` file.
7. At your domain registrar, point `foodican.com` to GitHub Pages using GitHub's current Pages DNS instructions. The exact DNS records can vary, so use the records GitHub shows for your repository.

## Automatic content

The scheduled workflow runs every 6 hours. It resolves the public YouTube channel behind `@thefoodican` with `yt-dlp`, then reads the channel's public Atom feed, and updates `data/content.json`.

The workflow can resolve the handle automatically. If you ever want to pin the channel permanently, set `YOUTUBE_CHANNEL_ID` in the workflow environment to the channel ID beginning with `UC`.

## Instagram + TikTok

The site already has social links, but the automatic content pipeline intentionally starts with YouTube because it is a stable canonical source. Instagram and TikTok can be associated with posts later without scraping either platform.

## Editing the site

- Logo: `assets/Foodican_Logo.png`
- Main page: `index.html`
- Styling: `styles.css`
- Front-end logic: `script.js`
- Content data: `data/content.json`
- YouTube updater: `scripts/update-content.js`
- Deployment: `.github/workflows/deploy.yml`
- Content refresh: `.github/workflows/update-content.yml`

The intended workflow is: **Create → post to YouTube → Foodican updates itself.**
