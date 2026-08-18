# Vows & Vibe

A collaborative bridal-party styling workspace with AI virtual try-on, skin-tone-based dress analysis, and a shared 2D lineup canvas.

Bridal-party styling is usually a messy combination of group chats, boards, and disconnected screenshots. VOWS&VIBE brings that process into one workspace: the bride defines the styling brief, bridesmaids try dresses virtually, and the final looks come together in a shared, interactive 2D lineup.

## Core Features
### Bride Flow

The bride signs in via Google, creates an event, and defines the dress length, fabric, color palette, and example dresses. She can upload a full-body photo and a selfie for analysis. The app uses YouCam Skin Tone Analysis to obtain skin and hair color HEX values and YouCam AI Clothes Changer to generate multiple VTO attempts. VTO history is normalized in the database (vto_attempts table), allowing users to switch between previous renders without losing state.

### Bridesmaid Invite Flow
Bridesmaids join via an invite link and do not need to create accounts. A server-stored session token allows them to login and resume their progress on the same device. She can upload a full-body photo and a selfie for analysis. The app uses the **YouCam Skin Tone Analysis** to obtain skin and hair color HEX values and use the **YouCam AI Clothes Changer API** to render multiple VTO attempts,VTO history is normalized in the database (`vto_attempts` table) so users can toggle between previous renders without losing state

### Collaborative 2D Lineup Canvas
* **Canvas Controls:** Participants can be dragged, scaled, layered, and repositioned.
* **Responsive Layout:** Positions and scale are stored as normalized participant metadata so the lineup remains resilient across different screen sizes.
* **Realtime Collaboration:** Saved lineup positions are propagated through **Supabase Postgres Changes**, allowing the bridal party to see lineup updates instantly.
* **Bride Export:** Only the bride can download the current canvas composition as a PNG.
* **Suggestions:** Each participant can turn **Suggestions ON or OFF**. When enabled, clicking another participant on the lineup selects that person as the suggestion recipient, allowing the sender to leave a text suggestion.
* **Color Harmony Filtering:** The bride can filter the lineup by selecting a palette swatch. The lineup provides two matching modes:
  * **Family Match:**The dress is compared only with palette colors in the same color family. The closest match is selected using circular hue-angle distance 
  * **Exact Match:** Uses normalized palette-color names to identify participants whose stored dress color matches the selected palette color exactly.
  * **Other:** outside the selected palette family

### Color Science & Compatibility Logic

Vows & Vibe uses **CIEDE2000 (ΔE00)** as part of its color-analysis and styling intelligence. Dress and skin/hair colors are converted to **CIE Lab** before perceptual color calculations.

In the **Bridesmaid Studio**, CIEDE2000 is additionally used to compare a newly selected bridesmaid dress against the colors of confirmed bridesmaid dresses and surface a relevant styling suggestion.

In general, dress compatibility is calculated using four weighted signals:

- **38% — Undertone/Hue Harmony:** Determines whether the dress color temperature complements the analyzed warm, cool, or neutral undertone.
- **28% — Lightness Separation:** Compares dress lightness against skin lightness to identify insufficient separation or potential washout.
- **20% — Chroma vs. Personal Contrast:** Considers dress color intensity relative to the natural contrast between the person's hair and skin.
- **14% — CIEDE2000 Perceptual Color Difference:** Adds a perceptual color-separation signal between the dress and complexion.

A separate **washout-risk safeguard** can limit the final score when a very light, low-chroma dress is likely to visually blend with the complexion.

**Note:** The resulting score and explanations are intended as styling guidance, not a definitive recommendation. Lighting, image quality, fabric characteristics, and individual preferences can affect the result, and the final decision remains with the bride and the person wearing the dress.

## Tech Stack

- **Framework:** Next.js 14 / React 18 / TypeScript
- **Backend/Auth/DB:** Supabase (Postgres, Auth, Storage, Realtime)
- **AI Try-On:** Perfect Corp YouCam AI (Cloth V4 & Skin-Tone Analysis)
- **Canvas:** Fabric.js 6.7.1 (loaded via CDN, no package dependency)
- **Image Processing:** `@imgly/background-removal-node` (server-side cutouts)
- **Validation:** Zod


### Canonical workflow

```text
Bride
  │
  ├─ Sign in with Google
  ├─ Create event
  ├─ Set styling requirements + moodboard
  ├─ Upload body photo
  ├─ Select/upload dresses
  ├─ YouCam VTO
  └─ Confirm look
           │
           ▼
       Shared event
           │
           ├───────────── Invite link ─────────────┐
           │                                       │
           ▼                                       ▼
     Bride lineup                           Bridesmaid flow
           │                                       │
           │                               upload photo
           │                               choose dress
           │                               YouCam VTO
           │                               confirm look
           │                                       │
           └───────────────┬───────────────────────┘
                           ▼
                   Shared 2D lineup
                           │
                 ┌─────────┴─────────┐
                 │                   │
                 ▼                   ▼
            Save/Filter lineup        Suggestions ON/OFF
                                      │
                                      ▼
                              participant → participant
```

## Local Setup

### Prerequisites
- Node.js 18+
- A Supabase project
- A Perfect Corp / YouCam API key
- Google OAuth Client (for Supabase Auth)
- Any LLM Api

### 1. Installation
```bash
git clone
cd vows-and-vibe
npm install
```

### 2. Environment Variables
Create a `.env.local` file based on `.env.example`:

### 3. Database & Storage Configuration
1. In Supabase, create a public Storage bucket named: `vto-renders`
2. Run the `supabase/schema.sql` script in the Supabase SQL Editor (the schema is idempotent).
3. Enable Google OAuth in Supabase Auth and set the callback URL to `http://localhost:3000/auth/callback`.

### 4. Run the App
```bash
npm run build
npm run dev
```

## Repository Structure

```text
src/
├── app/
│   ├── api/               # VTO, Events, Participants, Upload endpoints
│   ├── auth/              # OAuth callback
│   ├── dashboard/         # Bride event dashboard
│   ├── events/            # Event dashboard, style, lineup
│   ├── invite/            # Public bridesmaid invite entry
│   └── login/             # Google sign-in
├── components/
│   ├── BridalLookStudio.tsx
│   ├── BridesmaidFlow.tsx
│   ├── EventForm.tsx
│   ├── LineupCanvas.tsx    # Fabric.js bridal-party canvas
│   └── SuggestionTools.tsx
├── lib/
│   ├── color/             # Undertone & dress compatibility logic
│   ├── cutout/            # Image background removal
│   ├── storage/           # Supabase Storage helpers
│   ├── supabase/          # Browser/server clients
│   └── youcam/            # Perfect Corp API integration
└── middleware.ts          # Supabase auth session refresh
```

**Disclaimer:** The color analysis is intended as guidance rather than a strict rule. It provides a mathematical way to compare colors using undertone, lightness, contrast, and perceptual color difference, but the final choice always remains with the bride and the person wearing the dress.

## License

MIT License.
```
