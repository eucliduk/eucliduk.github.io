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

- `Start AR` requests the device rear camera.
- The scan frame compares the live camera view with the training images in `Training Images/targets` and then locks the Euclid label overlay when the model is recognized.
- `Lock` toggles the overlay manually for exhibit conditions where the model is already framed.
- `Demo` shows the included `Euclid_spacecraft.png` reference image with the same overlay for testing.
- The `Size`, `X`, and `Y` controls calibrate the overlay to the physical model and are saved in the browser.
- Add `?demo=1&reset=1` to the URL to open directly into a clean demo view.

The original `.DNG` photos are retained in `Training Images`. Browser-readable PNG target thumbnails are generated from them in `Training Images/targets`.

This app uses practical browser-only target matching. More precise pose tracking of the physical 3D model would require a dedicated WebXR/AR SDK pipeline.
