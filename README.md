# Mountain Tide 🌊⛰️

An experimental simulation inspired by Liu Cixin’s short sci‑fi story **“Mountain” (《山》)**. It visualizes how a massive celestial body distorts a local ocean surface through Newtonian gravity and a shallow‑water height‑field model. ✨

## What it does 🔭
- Models a **local ocean patch** with volume conservation and damping.
- Applies **Newtonian gravity** from a spherical body (with a smooth transition inside the sphere).
- Renders a **fixed‑view 3D height field** on an HTML canvas.

## Controls 🎛️
- **Mass**: adjust the body’s mass (log scale).
- **Volume**: adjust the body’s volume (log scale) and radius.
- **Height**: distance from sea level to the sphere’s bottom.
- **Grid size**: resolution of the height field.
- **Reset**: restore a calm ocean surface.
- **Drag** to rotate, **scroll** to zoom.

## Run locally 🚀
No build step required.

```bash
# just open the file in a browser
open index.html
```

Or serve it with any static server:

```bash
python3 -m http.server
```

Then visit `http://localhost:8000`.

## Notes 🧠
- This is a **visual, not scientific** simulation. Numbers are stylized for readability.
- The camera is fixed to a cinematic 45°‑ish view to emphasize the tidal bulge.

## License 📄
See `LICENSE`.
