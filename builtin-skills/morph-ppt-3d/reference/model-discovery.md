# Model Discovery Flow

When the user gives a topic but no `.glb`, proactively find a matching model.

## Step 1 — Suggest a model direction

| Topic type       | Model suggestion            | Example                                   |
| ---------------- | --------------------------- | ----------------------------------------- |
| Product/brand    | The actual product          | "coffee brand" → coffee cup, bean         |
| Animal/character | The animal or mascot        | "fox mascot" → fox 3D model               |
| Architecture     | Building or structure       | "new office" → office building, interior  |
| Vehicle          | The vehicle itself          | "EV launch" → car, motorcycle             |
| Food/cooking     | The dish or ingredient      | "Japanese food" → sushi, ramen bowl       |
| Tech/gadget      | The device                  | "phone launch" → phone, tablet            |
| Nature/science   | The subject                 | "solar system" → planet, earth            |
| Abstract concept | A symbolic object           | "teamwork" → puzzle pieces, gears         |

Offer two modes:

- **A — I search** (recommend 2–3 options) — default.
- **B — Self-service** (filtered links, user picks) — saves tokens.

## Step 2 — Search sources (mode A)

Sources ranked by **China mainland reachability**:

### Tier 1: Khronos glTF-Sample-Assets (most reliable, zero friction)

```bash
curl -L -o model.glb "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/[ModelName]/glTF-Binary/[ModelName].glb"
```

Available: Duck, Fox, Avocado, BrainStem, CesiumMan, DamagedHelmet, FlightHelmet, Lantern, Suzanne, WaterBottle, etc.

**CN fallback**: if `raw.githubusercontent.com` is blocked, use a GitHub mirror:

```bash
# ghproxy mirror (HTTPS only)
curl -L -o model.glb "https://mirror.ghproxy.com/https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/[ModelName]/glTF-Binary/[ModelName].glb"
```

### Tier 2: Sketchfab API (international, CN needs proxy)

```bash
curl -s "https://api.sketchfab.com/v3/search?type=models&q=[keyword]&downloadable=true&archives_flavours=glb" \
  | python3 -c "
import json, sys
for m in json.load(sys.stdin).get('results', [])[:5]:
    print(f\"{m['name']} — https://sketchfab.com/3d-models/{m['slug']}-{m['uid']} — license: {m.get('license', {}).get('label', '?')}\")
"
```

### Tier 3: Poly Pizza (CC0, CN unstable)

`curl -s "https://poly.pizza/api/search/[keyword]"` — all CC0, direct GLB download. Connectivity unreliable in mainland China.

## Step 3 — Self-service links (mode B)

- **Sketchfab** — `sketchfab.com/search?q=[keyword]&type=models&downloadable=true` — filter "Downloadable" + "glTF".
- **Poly Pizza** — `poly.pizza/` — CC0, direct `.glb`.
- **Free3D** — `free3d.com/3d-models/glb` (check license).
- **TurboSquid Free** — `turbosquid.com/Search/3D-Models/free/glb`.

## Step 4 — Download & verify

```bash
curl -L -o model.glb "<download_url>"
```

Verify: file exists, non-empty, `.glb` extension, size < 50 MB.

If Sketchfab gates download behind login, offer a Khronos sample as demo fallback.

## CN Mirror Security

- CN mirrors (ghproxy etc.) are **only** for downloading known GitHub assets via HTTPS. **Never** pass API tokens or credentials through mirrors.
- After download, verify file size matches expected value. For Khronos assets, cross-check SHA-256 against the official repository manifest when available.
- Only trust HTTPS sources. Reject plain HTTP downloads.

## License Check

Before confirming any download: CC0 / CC BY = free to use; CC BY-NC = non-commercial only. Always check.

## "Anything / you decide / just make a demo"

Don't grab a random model. Ask the user to pick a direction: Tech/Product · Animal/Character · Architecture · Food/Lifestyle · Other. Then search.
