# VibeTube Cloud v7.5 — Supabase Ride History + GPS Tracking

- Ride Tracking can be started/stopped from the dashboard menu.
- GPS track point sampled about every 2 seconds.
- Points buffer locally and upload to Supabase in batches, so brief network loss does not immediately lose the route.
- Supabase is the source of truth after sync.
- Ride session stores distance, duration, average/max speed, max left/right lean, start/end and point count.
- Ride History reads from Supabase and shows aggregate stats.
- Opening a ride renders the actual GPS route on Mapbox.
- Existing dashboard/map/navigation logic remains intact.

Backend tables/RPCs:
- vt_ride_sessions
- vt_ride_points
- vt_ride_start
- vt_ride_append
- vt_ride_finish
- vt_ride_history
- vt_ride_track

# VibeTube Cloud v7.3 — OEM UI Polish

UI-only pass. Navigation/GPS/routing/search/lean logic from v7.2 is intentionally unchanged.

Visual changes:
- More restrained OEM motorcycle-cluster typography and spacing.
- Cleaner speedometer hierarchy, dimmer ticks/labels, reduced glow.
- Lean card simplified with thinner borders and stronger left/right hierarchy.
- Bottom metrics aligned and normalized.
- Search bar reduced into a compact instrument control.
- Alternative route cards changed into compact route tabs.
- Turn instruction card rebuilt to feel like a vehicle cluster rather than a web card.
- Map controls reduced in size and visual weight.
- GPS marker made smaller and less cartoon-like.
- Fullscreen landscape treated as the primary composition.
- Portrait remains a deliberate fallback layout.

# VibeTube Cloud v7.2 — GPS Marker + Map Search

Fixes:
- The white navigation arrow is no longer a screen-centered overlay. It is now a real Mapbox marker anchored to the live GPS coordinates.
- Heading rotates the real GPS marker.
- Dragging/zooming the map disables auto-follow, so the GPS marker stays attached to its geographic position instead of following the screen center.
- Tap the compass/center action to re-enable follow mode.
- Added destination search directly inside the map using Mapbox Geocoding v6 forward search.
- Search is biased toward the current GPS position when available.
- Selecting a search result sets the destination marker, previews it on the map and automatically calculates selectable Mapbox routes.
- Tap-to-destination remains available as a secondary interaction.

# VibeTube Cloud v7.1 — Mapbox Navigation + Alternative Routes

- Replaces Leaflet/OpenStreetMap raster navigation view with Mapbox GL JS Navigation Night.
- Replaces public OSRM routing with Mapbox Directions `driving-traffic`.
- Requests `alternatives=true` and exposes up to three returned routes.
- Route chips show time and distance; tap a chip or route line to select it.
- ETA, remaining time/distance, turn steps and voice navigation follow the selected route.
- Live GPS marker and map camera follow the rider.
- Map uses pitch + bearing for a more navigation-like presentation.
- Existing speedometer, lean sensor and Android fullscreen hard-fix are preserved.

Security: the included token is a Mapbox public (`pk`) token intended for client-side use. Add URL restrictions in Mapbox before public deployment.
# VibeTube Cloud v7.0 — Android Fullscreen Hard Fix

Fixes the fullscreen failure visible on Android where only the left 40% panel rendered and the map/right HUD became black.

Key change:
- Native fullscreen is requested on the document root, not the dashboard grid itself.
- The dashboard is independently pinned to the viewport with `body.ride-fullscreen-mode`.
- Right map panel, Leaflet container, vehicle marker, turn card and controls are explicitly kept visible.
- Portrait media rules cannot stack the dashboard while ride fullscreen mode is active.
- Leaflet `invalidateSize()` runs repeatedly through the fullscreen/orientation transition.
- If Android rejects native fullscreen/orientation lock, the same viewport-fixed pseudo-fullscreen layout still remains usable.

# VibeTube Cloud v6.9 — Fullscreen Landscape Fix

Fixes Android/Chrome fullscreen Ride Dashboard:
- Requests landscape orientation after entering fullscreen when supported.
- Forces a 40/60 landscape grid even if Chrome temporarily reports a portrait media query during rotation.
- Removes rounded frame/borders in fullscreen and uses the complete viewport.
- Recalculates Leaflet map size several times after fullscreen/orientation resize to prevent blank, cropped or half-width maps.
- Unlocks orientation on fullscreen exit.
- Fullscreen controls, speedometer, lean card and turn card scale from viewport height to avoid vertical overflow.

# VibeTube Cloud v6.8 — Exact Speedometer + Lean Fix

Focused changes:
- Speedometer geometry, labels, tick layout, font weight, arc thickness and central number were rebuilt to match the provided reference more closely.
- Motorcycle outline asset is inline SVG, so no external image asset is required.
- Removed the old ±65° hard clamp that made lean-angle readings appear stuck at 65°.
- Lean angle now uses normalized device orientation + low-pass filtering.
- Actual lean values can pass 65°; only the motorcycle graphic itself is visually capped at ±80° to keep it readable.
- Calibration resets filtered angle and left/right max values cleanly.
- Existing map/navigation/dashboard features are preserved.

# VibeTube Cloud v6.7 — Ride Dashboard Rebuild

Focus: motorcycle dashboard only.

Changes:
- Rebuilt portrait, landscape, and fullscreen layouts.
- Motorcycle silhouette replaces the diamond lean marker.
- Lean sensor now uses deviceorientationabsolute/deviceorientation with screen-orientation normalization and calibration.
- GPS map follows the live position smoothly.
- Route line, ETA, distance, turn instruction, heading, weather and voice remain active.
- OpenStreetMap tile rendering has been tuned for a darker but more readable road map.
- Fullscreen invalidates/resizes Leaflet correctly.
- Portrait no longer squeezes the landscape layout; it uses a deliberate stacked layout.

Notes:
- Browser sensor support varies by device. Calibration is available from the dashboard menu.
- Public OSM tiles and public OSRM are suitable for prototyping/light use, not high-volume production.


# VibeTube Cloud v6.6 — Reference Ride Dashboard

Replaces the previous Ride HUD with a landscape-first split dashboard closely following the provided reference: GPS speedometer with 0–240 analog arc, device-orientation lean angle, live OpenStreetMap map, tap-to-set destination, OSRM route + turn steps, vehicle heading, compass, ETA/time/distance, Open-Meteo temperature, system clock, voice instructions, sensor calibration, fullscreen and menu controls.

Prototype routing uses the public OSRM demo endpoint; map uses standard OpenStreetMap tiles with visible attribution. For high-traffic production, configure dedicated map/routing services.

# VibeTube Cloud v6.5 — Ride HUD

Speedometer redesigned as OLED motorcycle HUD with live GPS speed, heading, GPS status, ride distance, average/max speed, timer, persistent ride state/history, and Maps shortcut.

# VibeTube Cloud v6.4 — Ric Space Toolbox

Speedometer + direction/GPS, Life Stats, Prompt Lab, Now Playing Card Maker, Garage, and Photo Spot Book. Local-first storage. Maps opens externally for navigation.

# VibeTube Cloud v6.3 — Universal Search

New:
- Search no longer opens youtube.com.
- Hybrid in-app search:
  1. Supabase `vt_catalog` first.
  2. If local results are insufficient, backend `vibetube-search` falls back to YouTube Data API v3.
  3. Results are displayed inside VibeTube and play through the official YouTube IFrame Player.
- When YouTube search quota is exhausted, search still works against the cloud catalog and clearly reports the fallback status.
- Search requests use `no-store`.
- Search results can be played directly using the same VibeTube queue/player controls.
- No direct audio extraction or stream scraping.

Backend:
- New Edge Function: `vibetube-search`.

# VibeTube Cloud v6.2 — Catalog + Category Hotfix

Fixes:
- Settings `Refresh` now has explicit loading/error feedback and always reads Supabase using `no-store`.
- `Isi Catalog Sekarang` is now a true mass-sync button: Jawa, Barat, Indo, Galau, Morning Vibes, Pop Punk, and Nightcore are synced sequentially, with live stats refreshed after each category.
- Initial mass-sync target is 200 active tracks/category to keep one browser action reasonably bounded. It can be raised later after the source pipeline is finalized.
- Japanese Nightcore remains excluded from catalog growth.
- Category chips and playlist cards now immediately return to Home and switch category in one tap.
- Category change scrolls Home to the top and immediately generates the selected mix.
- Supabase RPC execute permissions for catalog stats + Smart Mix were fixed in backend.

# VibeTube Cloud v6.1 — Ric Space

## New
- Header `Ric` is now clickable.
- Opens internal `Ric Space` without stopping/changing the current VibeTube player state.
- Ric Space currently contains:
  - VibeTube Music
  - PLU Timer
  - reserved slot for future tools
- PLU Timer is bundled under `/apps/plu-timer/`.
- PLU Timer manifest + Service Worker were re-scoped to `/apps/plu-timer/` so its cache/alarm/PWA behavior does not take over VibeTube root scope.
- PLU Timer includes a back button to `Ric Space`.
- VibeTube remains the root PWA and Smart Mix base from v6.0 is preserved.

# VibeTube Cloud v6.0 — Smart Mix Base

Base: VibeTube Cloud v5.5 Background Resilience.

## New in v6.0
- Smart Mix toggle in Settings (enabled by default).
- Smart Mix uses Supabase playback history: `complete`, `play`, `skip`, artist affinity, recency, and exploration randomness.
- Fixed playback telemetry: frontend now writes to the actual `vt_events` table instead of the obsolete/nonexistent `playback_events` path.
- Manual Next/Previous records a `skip`; natural track end records `complete`.
- Real-time Cloud Catalog stats in Settings:
  - total rows stored
  - active rows
  - inactive/quarantined rows
  - per-category counts
- Stats are read from Supabase RPC with `no-store`, refreshed when Settings opens and every 15 seconds while Settings is visible.
- Japanese Nightcore remains a special YouTube playlist source.
- YouTube playback remains the only playback provider.

## Backend required
Supabase migrations:
- `get_vt_catalog_stats()`
- `generate_vt_smart_mix(...)`

The `vibetube-mix` Edge Function v2 accepts `smartMix: true|false`.


# VibeTube Cloud v5.5 — Background Resilience

# VibeTube Cloud PWA v2

This is a cloud-ready PWA foundation.

## Important
- No YouTube Data API is used.
- No YouTube downloader, MP3 extraction, stream scraping, or offline media cache is included.
- Playback uses the official YouTube IFrame Player API.
- Japanese Nightcore preserves the official playlist:
  PLsWiDGlW9Vst4Vrc0IhVIdRYeurX7rV8z
- The PWA shell is cacheable, but YouTube media is not cached.

## Cloud
The UI accepts a Supabase URL and anon key in Settings.
The provided client is designed to call:
- `/rest/v1/playback_events`
- `/rest/v1/rpc/generate_mix`

The SQL schema and recommendation contract must be deployed before cloud generation works.

Without cloud credentials, the app falls back to a local catalog if one exists in `localStorage` under `vt_catalog`.

## Refresh behavior
- Active category is stored in `sessionStorage`, so browser refresh stays in the same category.
- New Mix is intended to create a new set, not merely reorder the current queue.
- Queue exhaustion requests another mix.

## Deployment
Upload the folder to Vercel or GitHub Pages over HTTPS.
For PWA installation, HTTPS is required (localhost is also acceptable for development).


## Cloud v3 fixes
- Browser now ships with the Supabase publishable key, so Settings is not required just to connect.
- Mix requests use `cache: no-store` and a unique nonce.
- Cloud errors are visible instead of being silently swallowed.
- Service-worker cache is versioned (`v2`) and deployment assets are network-first.
- The cloud mix function tracks `mix_served`, not only playback, so Refresh/New Mix can actually avoid the previous queue when enough catalog items exist.
- Important limitation: a category cannot produce 20 completely new songs forever if its cloud catalog only contains 20–27 unique songs. The catalog must be enlarged for genuinely new tracks.


Hotfix v5.1: restored static category chips and enhanced player DOM; made JS event binding null-safe; catalog sync no longer blocks initial mix.


## Android media notification
V5.3 integrates the Media Session API for Android/Chrome media controls: title, artist, YouTube thumbnail artwork, play/pause, previous, next, stop, seek backward/forward, seek-to, and position state. Actual notification/lock-screen presentation depends on browser/OS support and YouTube iframe behavior.


## v5.5 background-resilient playback
- Does not intentionally pause the YouTube player when the document becomes hidden.
- Persists category, queue, index, current video, position, play intent, and player mode.
- Uses Page Lifecycle events (`visibilitychange`, `pagehide`, `pageshow`, `freeze`, `resume`) to snapshot/recover state.
- Reclaims Media Session after resume/focus.
- Recovers a stalled player when Android/Chrome resumes the page, without changing the selected track.
- Avoids starting a new cloud mix over a recovered queue during reload.
- This improves resilience but cannot override Chrome/Android/YouTube background policies.
