# Euclid AR Overlay

Mobile-first web app for a QR-launched Euclid spacecraft AR overlay.

## Run locally

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000` on a desktop, or the machine's LAN address on a phone.

## QR launch

Host this folder on an HTTPS URL and point the QR code to `index.html`. Mobile browsers require HTTPS for camera access, except on `localhost` during development.

## Experience

- The page requests the rear camera automatically.
- Visitors pan their device until the Euclid model is in view.
- The app compares the live camera view with the training images in `Training Images/targets-small`, reveals the Euclid label overlay when the model is recognized, and keeps tracking the model's position so labels move with it.
- Add `?demo=1&reset=1` to the URL to open a development demo view.

The only target images needed by the app are the JPEGs in `Training Images/targets-small`.

This app uses practical browser-only target matching and lightweight position/scale tracking. More precise 3D pose tracking of the physical model would require a dedicated WebXR/AR SDK pipeline.
