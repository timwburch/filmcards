# filmcards
A simple site to create Film Cards to print in Index card

## Movie lookup

The **Add Movie/Show** dialog can search either:

- IMDb records through an [OMDb API key](https://www.omdbapi.com/apikey.aspx)
- [The Movie Database](https://www.themoviedb.org/settings/api) with a TMDB read access token

Enter the credential for the selected provider in the dialog. Credentials, film details, and downloaded stills are stored only in the current browser. TMDB results use a backdrop image when one is available; OMDb results use the IMDb poster supplied by that service.

## Still search

Use **Search for a still** in any card's photo well to open an image search for its current title. Copy an image address from a result, paste it into the dialog, preview it, and select **Use this still**. The chosen image is saved with that card in the browser when the image host permits downloading; otherwise its remote URL is retained.

## Cloud sync

Cards normally live only in the browser's IndexedDB. **Cloud sync** copies them into a [Neon](https://neon.tech) Postgres database and hands back a shareable link that restores them on any device.

Storage is normalised across three tables:

| Table | Holds |
| --- | --- |
| `access_requests` | One row per email address, with its approval state and hashed tokens |
| `sessions` | A named snapshot belonging to one approved address |
| `cards` | One row per film card, linked to its session by `session_id` |

Each card keeps its `card_index`, which mirrors the `film-data-<n>` / `film-still-<n>` keys in IndexedDB, so a restore rebuilds exactly the same records. Deleting a session removes its cards through `on delete cascade`.

Saving is gated on approval:

1. A visitor opens **Cloud sync** and submits their email address.
2. [Resend](https://resend.com) emails the owner a confirmation link.
3. The owner opens that link and presses **Approve** — the link only shows a confirmation page, so mail scanners that prefetch URLs cannot approve anyone by accident.
4. The requester receives a sign-in link. Opening it unlocks **Save to cloud** on that device.

Loading a session needs no approval: the session id is an unguessable UUID, so the link itself is the credential. Treat both links like passwords.

### Setup

The browser never talks to Neon directly — the connection string would be public. A small API sits in front of it, deployed as Vercel functions from `api/`.

```bash
npm install
cp .env.example .env        # fill in every value
npm run db:migrate          # applies db/schema.sql
npx vercel dev              # http://localhost:3000
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection string |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM` | Verified sender, e.g. `Film Cards <noreply@example.com>` |
| `OWNER_EMAIL` | Where approval requests are delivered |
| `API_BASE_URL` | Public origin serving `/api`, no trailing slash |
| `SITE_URL` | Public origin serving `index.html` |
| `ALLOWED_ORIGINS` | Comma-separated origins permitted to call the API |

Add the same variables in the Vercel project settings, then deploy with `npx vercel --prod`.

### Hosting the page on GitHub Pages

Deploying the whole repo to Vercel serves the page and the API from one origin and needs no extra configuration. To keep the page on GitHub Pages instead, deploy only the API to Vercel and then:

- set `CLOUD_API_BASE` in [index.html](index.html) to the Vercel origin, e.g. `https://filmcards.vercel.app`
- set `SITE_URL` to the Pages URL, e.g. `https://timburch.github.io/filmcards`
- include the Pages origin in `ALLOWED_ORIGINS`

### Notes and limits

- A session holds at most **500 cards**, and the whole batch is capped at **4 MB**. Uploaded stills are stored as base64 in `cards.still_url`, so a few large images will hit that ceiling — the save returns a clear error rather than truncating.
- Saving an existing session replaces its card rows rather than merging them, so cards deleted in the browser also disappear from the database.
- Access tokens are stored only as SHA-256 hashes; the plaintext exists solely in the emailed link and the visitor's `localStorage`.
- Requesting access more than once a minute per address is rejected, and re-requesting on an already-approved address rotates the token and emails a fresh link.
- To revoke someone, set their row's `status` to `revoked` in the `access_requests` table.
- **Loading a session replaces every card in the current browser.**

