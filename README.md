# Personal Timeline Feed

A simple personal feed for logging life events with photos, videos, dark mode, and an admin panel. No framework, no database, free to host.

## Stack

- **Cloudflare Pages** — hosts the site and runs the API
- **Cloudflare R2** — stores photos and videos
- **GitHub repo** — stores `events.json` (your data)

## Setup

### 1. GitHub

- Create a repo and add `events.json` with `{ "events": [] }`
- Generate a personal access token with the `repo` scope

### 2. Cloudflare

- Create an R2 bucket
- Create a Pages project pointing to this repo (build output dir: `.`)

### 3. Configure

Edit `wrangler.toml`:

```toml
name = "your-project-name"

[[r2_buckets]]
bucket_name = "your-bucket-name"

[vars]
GITHUB_REPO    = "yourname/your-repo"
SITE_URL       = "https://your-site.pages.dev"
ALLOWED_ORIGIN = "https://your-site.pages.dev"
```

Add your GitHub token as a secret:

```
npx wrangler pages secret put GITHUB_TOKEN
```

### 4. Deploy

```
npx wrangler pages deploy .
```

## Admin

Go to `/admin.html` to add, edit, and delete events. Keep the URL private — there's no login.

## Token expiry

If the feed stops loading, your GitHub token has likely expired. Generate a new one and run:

```
npx wrangler pages secret put GITHUB_TOKEN
npx wrangler pages deploy .
```
