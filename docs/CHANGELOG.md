# Changelog

## Unreleased (local build) — Skip video preview re-encode for directly-playable videos

### Motivation
User media consists of small, standard `h264 + yuv420p + aac` mp4 files that browsers
can play natively. The previous behavior re-encoded every video into a 720p preview
mp4 during scan (`writeVideoPreview`), wasting ~11.6 min of startup scan time and
doubling storage (one re-encoded copy per video in `data/previews/`).

### Change
- `server/src/services/derivative-service.ts`
  - `generateVideoDerivatives` now takes `playbackStrategy`. When it is `'original'`,
    the expensive `writeVideoPreview` (ffmpeg re-encode) is skipped. Thumbnail
    extraction (`writeVideoThumbnail`, ffmpeg single-frame) is preserved.
  - `generateDerivatives` passes `metadata.playbackStrategy` into the video branch.
  - `generatePreviewDerivative` (lazy path) reads video metadata and skips the
    re-encode for `'original'` videos.
- `server/src/services/gallery-service.ts`
  - `buildPreviewUrl` returns `buildOriginalUrl(id)` for `video` + `original`
    strategy, so the client plays the original file instead of a (now absent)
    re-encoded preview.
  - Three call sites (`mapFeedImage`, `mapImageDetail`, `mapTrashImage`) pass
    `playbackStrategy`.

### Verification (blank docker startup, 322 valid videos + 8 corrupt)
- Previews generated: **322 → 0** (no ffmpeg re-encode, no duplicate storage)
- Thumbnails generated: **322** (unchanged, list grid still works)
- Total scan duration: **701498ms → 34371ms** (~11.7 min → ~34 s)
- API: original video `previewUrl` = `/api/originals/:id` (serves source file, HTTP 200)
- `data/previews/*.mp4` count: **0**

### Notes
- `docker-compose.yml` switched from `image: ghcr.io/foldergram/foldergram:latest`
  to `build: .` so local source changes take effect.
- Non-`original` videos (e.g. HEVC / non-yuv420p) still re-encode as before.
- Images are unaffected (`playbackStrategy` is always `preview` for images).
