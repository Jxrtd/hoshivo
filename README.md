# Hoshivo

Anime browsing with AnimeParadise playback, a watchlist, and Recently watched.

## Run

Install Node.js 22+ and Git, then:

```sh
npm install
npm run setup:providers
npm start
```

Open http://localhost:3000. The runner starts the website on port 3000 and the local anime-sdk service on port 3031, registering only AnimeParadise. Other playback adapters, testing controls, and local services have been removed. Set PORT to change the website port. Restart npm start after backend changes.

The ignored .local-providers/anime-sdk checkout comes from https://github.com/hexxt-git/anime-sdk, retains its MIT license, and is built during setup. Setup preserves an existing checkout and does not automatically pull updates.

## Watching

Open an anime and press Play episode. The player uses hls.js where supported, with native HLS as a fallback. It shows a poster before playback and reports loading, errors, and stalled streams. Reload video resolves a fresh stream, with a ten-second refresh cooldown. AnimeParadise provides subtitled playback; availability varies by title and episode.

Episode selection, Next, and Previous update the URL to `#anime/{id}/episode/{number}`. Refreshing or sharing that link opens the selected episode. Browser Back/Forward restores episode selections without rebuilding the title page.

Right Arrow seeks forward five seconds; Left Arrow seeks back five seconds. These shortcuts work while the episode is open, including when the video has focus, and leave text fields and form controls alone. A deliberate keyboard seek into an intro or outro temporarily overrides automatic skipping for that segment so the seek is not immediately undone.

Playback controls fade out after five seconds of inactivity while playing. Moving the pointer, tapping the player, or tabbing into its controls shows them again. Arrow-key seeking and automatic intro/outro skips keep hidden controls hidden and do not display skip popups. Brief buffering during a seek updates the status below the picture without opening the central loading overlay. Paused playback keeps controls available.

Recently watched appears on the homepage. It records an anime only after playback starts, keeps up to 20 shows in this browser, and displays the latest 12. Each card includes the episode, saved time, and a progress bar. Clicking it opens the saved episode and resumes its playback position. Completed episodes can be replayed. Progress saves every five seconds, on pause, on navigation, and when leaving the page. Clear history removes Recently watched; the watchlist is separate. Browser storage must be available for persistence.

The compact episode sidebar sits to the left of the player on desktop and shows episode numbers and titles. Watched rows use a darker background and muted text, with no check marks or status badges. The current episode retains a selection border. Viewing state remains available to screen readers. Rows darken as soon as playback starts, even if the episode is unfinished. Completion stays separate so unfinished episodes still resume at their saved position. Per-episode progress is saved in this browser and survives refreshes. Search by episode number or title.

Recent catalog metadata comes from https://anikotoapi.site. Search queries the full AnimeParadise catalog after a short typing delay, so it can find titles beyond the currently loaded homepage listings. Search results open AnimeParadise details and episode lists directly. Search inside My watchlist filters saved titles. A title appearing in the recent catalog does not guarantee that AnimeParadise has its video.

The homepage dashboard shows 12 latest episode updates per page in two rows and six columns on desktop. Previous/Next changes the page without expanding the grid. Episode badges and cards open the newest episode listed for a title. The right-hand Top anime panel switches between Day, Week, and Month. Its order comes from Anikoto's published viewing rankings, not Hoshivo watch counts; no view totals are fabricated. Rankings are cached for five minutes, show a retry action on failure, and stack below the episode grid on smaller screens. Search and the watchlist keep the full-width layout.

An estimated release schedule appears below the 12 episode cards. Day/Week buttons show the selected date or its Monday-to-Sunday week; choose a weekday or Today to change the day. All dates and times use Asia/Manila (PHT/UTC+8). The schedule comes from Anikoto and includes earlier and estimated releases. Incomplete days show a retry action instead of invented entries. Every anime page also shows next-release estimates below the player, using supplied next-airing metadata or AniList's announced future airings. Finished seasons and unannounced dates are identified explicitly. Schedule data is cached for five minutes; player availability can lag the estimate.

Subtitles use white text with a shadow and a transparent background.
Bottom subtitles move above the controls while they are visible and keep a bottom margin of at least 20 pixels (6% of video height) when the controls fade. The offset adjusts to mobile layouts and fullscreen; captions explicitly placed near the top retain their placement.

Auto-skip intro and outro are both enabled by default. The player seek bar highlights the intro in green and outro in purple, with timestamp tooltips. The overlay control strip at the bottom of the picture includes play/pause, seeking, volume, subtitles, speed, and fullscreen. Fullscreen includes the controls and colored seek bar. The two switches below the player remember your preferences in this browser. Skips use episode-specific timestamps supplied by AnimeParadise; no fixed-duration guesses are used. If auto-skip is off, a manual Skip intro or Skip outro button appears during the corresponding segment. Episodes without timestamps show an availability message and play normally. Outro skipping stops at the supplied end time so any post-credit content can still play.

## Checks

```sh
npm test
npm run test:browser
```

The browser check requires the running app and an installed Chrome or Edge executable. Set BROWSER_PATH for another Chromium executable. It verifies real playback, Recently watched, resume behavior, clearing history, and mobile layout. Reports and screenshots are saved in ignored .local-results/.

## Backend

- Five-minute catalog cache, concurrent request deduplication, and a conservative 55-request/two-minute catalog budget.
- Playback resolution is cached for two minutes; refresh is limited to once per ten seconds per episode.
- Exact title/year matching avoids accidentally playing another series.
- Media uses random one-hour capability URLs, public HTTPS destination validation, HLS playlist rewriting, provider-supplied headers, and byte-range support. No arbitrary URL proxy endpoint is exposed.

This is a local development setup. The website binds to loopback; do not expose the upstream SDK service publicly. Restarting the backend invalidates media tokens, so refresh the browser afterward. Upstream availability and regional restrictions can affect playback.
