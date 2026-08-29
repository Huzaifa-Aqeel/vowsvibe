# Vows & Vibe

A collaborative bridal-party styling workspace with AI virtual try-on, skin-tone-based dress analysis, and a shared interactive 2D lineup canvas.

Bridal-party styling is often a messy combination of group chats, inspiration boards, and disconnected screenshots. Vows & Vibe brings that process into one workspace: the bride defines the styling brief, bridesmaids try dresses virtually, and confirmed looks come together in a shared interactive lineup.

## Core Features

### Bride Flow

The bride signs in with Google, creates an event, and defines the dress length, fabric, color palette, and example dresses. She can upload a full-body photo and selfie for analysis.

The app uses YouCam Skin Tone Analysis to obtain skin and hair color HEX values and YouCam AI Clothes Changer to generate multiple virtual try-on (VTO) attempts. VTO history is normalized in the database through the `vto_attempts` table, allowing users to switch between previous renders without losing state.

### Bridesmaid Invite Flow

Bridesmaids join through an invite link and do not need to create accounts. A server-stored session token allows them to log in and resume their progress on the same device.

A bridesmaid can upload a full-body photo and selfie for analysis. The app uses YouCam Skin Tone Analysis to obtain skin and hair color HEX values and YouCam AI Clothes Changer to generate multiple VTO attempts.

### Collaborative 2D Lineup Canvas

- **Canvas Controls:** Participants can be dragged and repositioned.
- **Responsive Layout:** Positions are stored as normalized participant metadata so the lineup remains resilient across screen sizes.
- **Realtime Collaboration:** Saved lineup positions are propagated through **Supabase Postgres Changes**, allowing the bridal party to see lineup updates in real time.
- **Bride Export:** Only the bride can download the current canvas composition as a PNG.
- **Suggestions:** Each participant can turn **Suggestions ON or OFF**. When enabled, selecting another participant in the lineup allows the sender to leave a suggestion for that person.

### Color Harmony Filtering

The bride can explore the lineup using three mutually exclusive color-harmony modes:

- **Palette Match:** Uses normalized palette-color names to identify dresses that exactly match one of the bride's selected palette colors. Exact matches always take priority and cannot also be classified as Family Matches.
- **Family Match:** For dresses without an exact palette match, the dress HEX is converted to **CIE Lab** and assigned to a broad color family. It is compared only with palette swatches in that same family. **CIEDE2000 (ΔE00)** selects the single perceptually closest palette swatch. The dress qualifies as a Family Match only when that distance is within the configured family-match threshold.
- **Other:** Contains dresses that qualify for neither Palette Match nor Family Match. Other is a global category rather than being associated with individual palette swatches.

Each dress belongs to exactly one color-harmony classification at a time.

### Color Science & Compatibility Logic

Vows & Vibe converts dress, skin, and available hair colors into **CIE Lab** for color analysis.

**CIEDE2000 (ΔE00)** is used where perceptual color difference is the relevant measurement, including:

- finding the closest same-family palette swatch
- comparing a newly selected dress with confirmed bridesmaid dresses
- identifying visually similar or distinct dress colors
- supporting contextual styling explanations

CIEDE2000 measures perceptual color difference; it is not treated directly as a measure of how flattering a dress is.

Dress compatibility is based primarily on independent styling signals:

- **Undertone / Hue Relationship:** Evaluates how the dress color direction relates to the analyzed warm, cool, or neutral undertone.
- **Lightness Relationship:** Measures the separation between dress and skin lightness and helps identify low-contrast combinations.
- **Chroma / Personal Contrast:** Evaluates dress color intensity relative to the wearer's complexion and, when available, natural skin-to-hair contrast.

When hair-color information is unavailable, the system does not invent a personal-contrast value; scoring relies on the available signals instead.

A separate **low-separation / washout safeguard** detects cases where a low-chroma dress is also very close to the complexion in lightness and chroma. Low chroma alone is not considered a washout risk.

**Note:** The resulting score is presented as a **compatibility index and styling guide**, not a probability or scientifically definitive recommendation. Lighting, camera accuracy, fabric characteristics, surroundings, personal preference, wedding palette, and styling choices can all influence the final appearance.

## Tech Stack

- **Framework:** Next.js 14, React 18, TypeScript
- **Backend / Auth / Database:** Supabase (Postgres, Auth, Storage, Realtime)
- **AI Virtual Try-On:** Perfect Corp YouCam AI
- **Canvas:** Fabric.js 6.7.1
- **Image Processing:** `@imgly/background-removal-node`
- **Validation:** Zod

## Canonical Workflow

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
            Save/Filter lineup    Suggestions ON/OFF
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

### 1. Installation

```bash
git clone <your-repository-url>
cd vows-and-vibe
npm install
```

### 2. Environment Variables

Create a `.env.local` file based on `.env.example`.

### 3. Database & Storage Configuration

1. In Supabase, create a public Storage bucket named `vto-renders`.
2. Run the `supabase/schema.sql` script in the Supabase SQL Editor. The schema is idempotent.
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
