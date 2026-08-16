# VibeTube Cloud v3 — Vercel + Supabase

## Connection model
This is a static PWA. Vercel hosts the HTML/CSS/JS; the browser connects directly to Supabase over HTTPS. No special Vercel-to-Supabase server connection is required.

`cloud-config.js` contains the Supabase project URL and browser-safe publishable key. The app first tries the Supabase Edge Function and automatically falls back to the PostgREST RPC `generate_vt_mix`, which avoids Edge Function/CORS failures.

## Deploy
1. Upload this folder as a Vercel project.
2. Deploy as a static site; no build command is required.
3. Open the deployed site over HTTPS.
4. Settings should show the Supabase URL already filled.
5. Click Save Cloud Config once if desired.
6. Home should show `Cloud RPC` or `Cloud Edge`, not `Cloud gagal`.

## Supabase
Project ref: `ejgmyxzmjkmqofacrusv`
RPC: `public.generate_vt_mix`

The RPC already has EXECUTE permission for `anon` and `authenticated`.

## If the old app is cached
Vercel headers disable caching for the critical files and the service-worker cache was bumped to v3. If Chrome still shows the old UI, close all tabs for the site once and reopen the URL.
