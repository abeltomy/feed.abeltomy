# Personal Timeline Feed

A personal feed for logging life events — photos, videos, dark mode, and a private admin panel. No framework, no database, runs entirely on free infrastructure.

![feed.abeltomy.com](Screenshot%202026-06-05%20120314.png)

---

## How it works

Your events are stored as a plain JSON file (`events.json`) in a GitHub repo. When someone opens the site, a serverless function reads that file via the GitHub API and returns it to the browser. When you add or edit an event from the admin panel, the same function writes the updated JSON back to GitHub. Photos and videos are uploaded to Cloudflare R2 (object storage) and served directly from there.

Everything is glued together by Cloudflare Pages, which hosts the static files and runs the serverless functions — no separate server needed.

| Service | What it does | Cost |
|---|---|---|
| Cloudflare Pages | Hosts the site + runs API functions | Free |
| Cloudflare R2 | Stores uploaded photos and videos | Free up to 10 GB |
| GitHub | Stores `events.json` | Free |

---

## Setup

### 1. Create a GitHub repo for your data

Create a new GitHub repo (can be private). Add a file called `events.json` with this content:

```json
{ "events": [] }
```

Then generate a personal access token so the serverless function can read and write this file:

- Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
- Click **Generate new token**
- Give it a name, check the **`repo`** scope, and generate it
- Copy the token — you'll need it in step 4

### 2. Set up Cloudflare

- Sign up at [cloudflare.com](https://cloudflare.com) if you don't have an account
- Go to **R2** and create a bucket (e.g. `my-feed-media`) — this is where your photos and videos will live
- Go to **Pages**, connect your GitHub account, and create a new project pointing to your fork of this repo
- When asked for a build output directory, enter `.` (just a dot — there's no build step)

### 3. Configure the project

Open `wrangler.toml` and update it with your own values:

```toml
name = "your-project-name"

[[r2_buckets]]
bucket_name = "your-bucket-name"

[vars]
GITHUB_REPO    = "yourname/your-repo"
SITE_URL       = "https://your-site.pages.dev"
ALLOWED_ORIGIN = "https://your-site.pages.dev"
```

### 4. Add your GitHub token as a secret

The token must be stored as a secret, not in the config file. Run this in the project folder:

```
npx wrangler pages secret put GITHUB_TOKEN
```

Paste your token when prompted. Cloudflare encrypts and stores it — it never appears in your code.

### 5. Deploy

```
npx wrangler pages deploy .
```

Your feed is live at `https://your-project-name.pages.dev`.

---

## Admin panel

Go to `/admin.html` to add, edit, and delete events. From there you can:

- Set a date range, title, location, and description
- Upload photos and videos (HEIC is supported and auto-converted)
- Attach links to each event
- Archive events to hide them from the public feed without deleting them

### Locking it down with Cloudflare Zero Trust

By default the admin page has no login — if someone finds the URL, they can edit your feed. Cloudflare Zero Trust lets you put a proper authentication wall in front of it with no code changes. It's free for up to 50 users.

**What it does:** instead of reaching your admin page directly, any visitor is first intercepted by Cloudflare and shown a login screen. They enter an email address, and if that address is on your allowed list, Cloudflare sends them a one-time code. They enter the code and get through. Anyone else is blocked entirely — your actual page is never even reached.

**How to set it up:**

1. Go to [one.dash.cloudflare.com](https://one.dash.cloudflare.com) and activate Zero Trust (free tier, no credit card needed)

2. Navigate to **Access → Applications → Add an application**, then choose **Self-hosted**

3. Fill in the details:
   - **App name** — anything, e.g. `Feed Admin`
   - **Domain** — your site's domain, e.g. `feed.abeltomy.com`
   - **Path** — `admin.html`
   - **Session duration** — `24 hours` (you'll stay logged in for a day before needing to re-verify)

4. On the next screen, create a policy:
   - **Action** — `Allow`
   - **Include rule** — set it to `Emails` and enter your own email address

5. Save. That's it — `/admin.html` is now gated.

6. **Optional but recommended:** repeat the same process for the path `api/upload` to also protect direct media uploads.

Next time you visit `/admin.html`, you'll be redirected to a Cloudflare login screen, enter your email, get a code, and be let through. The session lasts 24 hours so you won't need to do it every time.

---

## If the feed stops loading

The most likely cause is an expired GitHub token. Tokens can be set to expire after 30, 60, or 90 days — when they do, the API can no longer read `events.json` and the feed shows an error.

To fix it, generate a new token on GitHub (same steps as before) and then run:

```
npx wrangler pages secret put GITHUB_TOKEN
npx wrangler pages deploy .
```

To avoid this happening again, either set the token to never expire, or put a reminder in your calendar before the expiry date.
