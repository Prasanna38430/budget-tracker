# Budget Tracker

A single-page budget tracker that keeps everything in your browser's localStorage — no accounts, no server, no build step.

> _Screenshot goes here._ Save one to `docs/screenshot.png` and swap this line for:
> `![Budget Tracker](docs/screenshot.png)`

## What it does

- Set a starting balance and change it whenever you like
- Log expenses and credits with a category, date and optional note
- Running balance, plus money in/out for whichever month you're looking at
- Filter by month and category
- Eight categories to start with, add your own as you go
- Export everything to CSV and import it back (handy for backups or moving browsers)
- Spending-by-category bars for the selected month

Amounts are formatted in euro. Data lives in one localStorage key, `budget-tracker.v1`,
so clearing site data for the page wipes it — export a CSV first if you care about it.

## Running it locally

There's nothing to install. Open `index.html` in a browser and it works.

If you'd rather serve it over HTTP (closer to how Pages will run it):

```bash
python -m http.server 4173
```

Then go to http://localhost:4173.

## Putting it on GitHub Pages

The site is served straight from the repo root, so there's no workflow or build to set up.

1. Push the repo to GitHub (see below if you haven't created it yet).
2. Open the repository on github.com.
3. Go to **Settings** → **Pages** (left sidebar, under "Code and automation").
4. Under **Build and deployment**, set **Source** to `Deploy from a branch`.
5. Set **Branch** to `main` and the folder to `/ (root)`, then hit **Save**.
6. Give it a minute or two. The URL appears at the top of the same Pages screen and
   looks like `https://<your-username>.github.io/<repo-name>/`.

Every push to `main` republishes the site.

## CSV format

Export writes these columns:

```
date,type,amount,category,note,id
2026-09-07,expense,99.99,Shopping,Running shoes,doehonho
```

- `date` — `YYYY-MM-DD`
- `type` — `expense` or `credit` (`income` and `debit` are accepted on import)
- `amount` — positive number; a leading minus is ignored on import, the type column decides direction
- `id` — used to skip rows you've already imported. Leave it blank for new rows and one gets generated.

Import adds to what's already there rather than replacing it, and rows it can't
parse are counted and skipped rather than failing the whole file.

## Files

```
index.html   markup
style.css    styling, including the dark-mode palette
app.js       all the behaviour
```
