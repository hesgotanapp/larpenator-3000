# Larpenator 3000 — Desktop

Personal trading journal as a desktop app (Electron). All user data lives in the OS
user-data folder (`%APPDATA%\Larpenator 3000` on Windows), never inside the app or
installer. A fresh install starts empty with a welcome screen.

## Development

```
npm install      # once
npm start        # run the app in dev mode
```

The entire UI lives in `app/index.html` (single self-contained file, offline).

## Building an installer locally (Windows)

```
npm run icons    # regenerate app icons from build/icon.svg (only when the logo changes)
npm run dist     # produces dist/Larpenator 3000 Setup <version>.exe
```

## Releasing a new version (auto-updates everyone)

1. Bump `"version"` in `package.json` (e.g. `1.0.1`).
2. Commit: `git add -A && git commit -m "v1.0.1"`
3. Tag and push:
   ```
   git tag v1.0.1
   git push && git push --tags
   ```
4. GitHub Actions builds Windows/Mac/Linux installers and attaches them to a GitHub
   Release automatically (takes ~10-15 min). Once the release is published, installed
   apps detect it on next launch, download in the background, and prompt to restart.

## Notes on signing

- **Windows**: builds are unsigned — first-time installers see a SmartScreen prompt
  ("More info → Run anyway"). Auto-update still works. A code-signing certificate
  (~$100-300/yr) removes the prompt.
- **Mac**: unsigned builds require right-click → Open on first launch, and Mac
  **auto-update does not work unsigned** (Apple requirement). Mac users update by
  downloading the new .dmg manually until an Apple Developer certificate ($99/yr)
  is added.
- **Linux**: AppImage, no signing needed.

## Swapping the logo

Replace `build/icon.svg` with the final logo (square), run `npm run icons`, rebuild.

## Where user data lives

- Windows: `%APPDATA%\Larpenator 3000\`
- Mac: `~/Library/Application Support/Larpenator 3000/`
- Linux: `~/.config/Larpenator 3000/`

Uninstalling keeps this folder (data survives reinstalls). Users can back up /
restore via Backup & Export inside the app.
