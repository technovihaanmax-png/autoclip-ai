# AUTOCLIP AI

A free, browser-based automatic Shorts editor hosted on GitHub Pages. Video processing runs locally in the user's browser; there is no paid backend or cloud rendering service.

## Current browser workflow

1. Choose a saved livestream recording from your device.
2. Choose 5–15 target clips.
3. The browser analyses audio energy to find candidate moments and avoids selecting overlapping sections where possible.
4. Optional local Hindi speech recognition creates transcript captions, then a basic Devanagari-to-Roman transliteration is applied for Hinglish-style captions.
5. Optional MediaPipe face detection reframes the main video around a detected face. If no face is detected or the model cannot load, the editor falls back to a centred vertical crop.
6. Optional smart zoom reacts to audio-energy peaks.
7. A transcript-derived title, creator label and captions are burned into each vertical clip.
8. The separate approval page previews clips, lets the user approve individually or all at once, and downloads individual WebM files or a ZIP of approved clips.

## Important limitations

- GitHub Pages is static hosting. A YouTube URL cannot be downloaded or decoded directly by this website. Select a local video file that you own or have permission to edit.
- The highlight detector is an audio-energy heuristic, not a semantic AI understanding of the whole stream. It can miss quiet but important moments and may select loud music or sound effects.
- Face tracking is best-effort and depends on the free MediaPipe model loading successfully. It does not identify people; it only locates a face in the current video frame.
- Hinglish captions depend on browser memory, network access for the open-source model download, and speech recognition quality. Transliteration is approximate.
- Export is WebM because browser-native MediaRecorder support is broadly available; MP4 export is not currently included.
- Browser processing uses the device CPU/GPU and memory while rendering. Keep the tab open, use shorter recordings for testing, and close other heavy tabs if the Chromebook struggles.
- This is a first browser-only build. Do not treat clip detection, titles, captions or reframing as guaranteed perfect.

## Files

- `index.html` — editor interface
- `style.css` — responsive UI and approval styles
- `script.js` — local analysis, transcription, tracking and rendering
- `approval.html` / `approval.js` — review, approval and ZIP download

## Run

Open the GitHub Pages site or serve the folder from a local static web server. Browser media APIs generally work best over HTTPS or localhost.
