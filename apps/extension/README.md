# RealtimeBuddy Recorder Extension

Chrome/Chromium MV3 extension that:

- captures the current tab audio plus a selected microphone
- streams live PCM chunks into the RealtimeBuddy backend
- opens or links the companion web app into the same shared session for live Q&A

## Load locally

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `apps/extension` directory

## Configure

- `Companion App URL`: the deployed Next.js web app, for example `https://buddy.example.com`
- `Backend Base URL`: optional override if the backend is not on the same host as the app
- `Microphone`: selected capture device
- `Language`: forwarded into the backend session

The extension fetches a short-lived backend websocket token from the companion app's `/api/backend-auth`
route, then opens the companion app with `?session=<id>` once a recording session is live.
