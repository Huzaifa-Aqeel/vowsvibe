# Vows & Vibe

An AI-powered bridal-party styling workflow and collaborative 2D lineup canvas. Built for the Perfect Corp / YouCam AI Hackathon.

Bridal-party styling is usually a messy combination of group chats, Pinterest boards, and disconnected screenshots. Vows & Vibe consolidates this into a single workspace: a bride defines the styling brief, bridesmaids try on dresses virtually, and the final looks are composed into a shared, interactive 2D lineup.

## Core Features

### Bride Event Creation & Studio
The bride signs in via Google, creates an event, and defines dress length, fabric, and a color palette. She can upload a full-body photo and use the YouCam AI Clothes Changer to render multiple VTO attempts. VTO history is normalized in the database (`vto_attempts` table) so users can toggle between previous renders without losing state.

### Bridesmaid Invite Flow
Bridesmaids join via an invite link and do not need to create accounts. A server-stored session token allows them to resume their progress on the same device. They upload a photo, pick a dress, run the VTO, and confirm their look.

### Collaborative 2D Lineup Canvas
* **Canvas Controls:** Participants can be dragged, scaled, layered, and repositioned.
* **Responsive Layout:** Positions and scale are stored as normalized participant metadata so the lineup remains resilient across different screen sizes.
* **Realtime Collaboration:** Saved lineup positions are propagated through **Supabase Postgres Changes**, allowing the bridal party to see lineup updates without polling.
* **Bride Export:** Only the bride can download the current canvas composition as a PNG.
* **Suggestions:** Each participant can turn **Suggestions ON or OFF**. When enabled, clicking another participant on the lineup selects that person as the suggestion recipient, allowing the sender to leave a text suggestion.
* **Color Harmony Filtering:** The bride can filter the lineup by selecting a palette swatch. The lineup provides two matching modes:
  * **Closest Tone:** Each participant's dress color is converted to CIE Lab and compared against every palette swatch using **CIEDE2000**. The palette swatch with the smallest perceptual color difference is selected as the participant's closest match.
  * **Exact Match:** Uses normalized palette-color names to identify participants whose stored dress color matches the selected palette color exactly.

### Color Science & Compatibility Logic  
Vows & Vibe implements the **CIEDE2000 color-difference formula**, a standardized perceptual color-difference calculation, as part of its color-matching and styling intelligence.Dress and palette colors are converted into **CIE Lab** before perceptual comparison. CIEDE2000 is used to identify the closest palette shade while accounting for differences that are more meaningful to human color perception than simple RGB distance.

Beyond palette matching, the local color engine calculates a **0–100 dress compatibility score** using YouCam-derived skin-tone and hair information.

The scoring engine evaluates multiple signals:

- **Undertone-to-Hue Harmony:** Determines whether the dress color temperature complements the analyzed warm, cool, or neutral undertone.
- **Lightness Separation:** Compares the dress lightness against skin lightness to identify potential washout or insufficient visual separation.
- **Chroma vs. Personal Contrast:** Considers dress color intensity relative to the natural contrast between the person's hair and skin.
- **Perceptual Color Difference:** Uses CIEDE2000 as an additional perceptual separation signal.
- **Washout Risk:** Detects very light, low-chroma colors that may visually blend with the person's complexion.

**NOTE:** The result is a human-readable compatibility score with explanations rather than a hard recommendation, keeping the bride in control of the final styling decision.

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
git clone <YOUR_REPOSITORY_URL>
cd vows-and-vibe
npm install
```

### 2. Environment Variables
Create a `.env.local` file based on `.env.example`:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser-safe Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only privileged DB/storage ops |
| `NEXT_PUBLIC_SITE_URL` | Yes | Absolute app URL for invite/auth redirects |
| `YOUCAM_API_KEY` | Yes | Perfect Corp YouCam server API key |
| `YOUCAM_API_BASE` | Yes | YouCam API base URL |
| `GROQ_API_KEY` / `OPENROUTER_API_KEY` | yes | LLM for dress hex resolution from pallate name |

### 3. Database & Storage Configuration
1. In Supabase, create a public Storage bucket named: `vto-renders`
2. Run the `supabase/schema.sql` script in the Supabase SQL Editor (the schema is idempotent).
3. Enable Google OAuth in Supabase Auth and set the callback URL to `http://localhost:3000/auth/callback`.

### 4. Run the App
```bash
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
│   ├── color/             # CIEDE2000 & dress compatibility logic
│   ├── cutout/            # Image background removal
│   ├── storage/           # Supabase Storage helpers
│   ├── supabase/          # Browser/server clients
│   └── youcam/            # Perfect Corp API integration
└── middleware.ts          # Supabase auth session refresh
```
## Consumer & Retail Value

Vows & Vibe addresses the fragmented reality of bridal-party shopping—where decisions are usually scattered across group chats, screenshots, and Pinterest boards. By placing the bride and her bridesmaids in a single shared workspace, the app streamlines the shortlisting process. Bridesmaids join effortlessly via a link without creating an account, use YouCam virtual try-on to test looks, and feed those renders directly into a shared 2D lineup. By pairing personal color analysis—evaluating undertones, lightness, and contrast—with this group view, the app ensures dresses look cohesive together, rather than just in isolation.

For retailers and bridal salons, the platform serves as an efficient pre-fitting consultation tool. Stylists can curate palettes and help clients narrow down shortlists virtually before in-person fittings begin. By moving the shade comparison process upstream, the app reduces back-and-forth communication and helps prevent costly purchasing mistakes. The value isn't about replacing the stylist or the fitting room; it's about helping customers shortlist, compare, and align on a final group look before they even step into the store.

**Disclaimer:** The color analysis is intended as guidance rather than a strict rule. It provides a mathematical way to compare colors using undertone, lightness, contrast, and perceptual color difference (CIEDE2000), but the final choice always remains with the bride and the person wearing the dress.

## License

MIT License.
```