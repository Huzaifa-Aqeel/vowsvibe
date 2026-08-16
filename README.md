# Vows & Vibe

Vows & Vibe is a Next.js + Supabase bridal-suite experience for a bride and her bridesmaids.

## Architecture

- Bride creates an event and is immediately redirected to her private Bridal Look Studio.
- Bride uploads her body photo, uploads/chooses dresses, and can run unlimited VTO attempts.
- Every participant uses the same normalized fitting-room model.
- Each person has one `participants` row, many `participant_dresses`, and many `vto_attempts`.
- Confirming a VTO marks the exact attempt as confirmed and updates the participant row.
- The bride dashboard shows the shareable invite link, bridesmaid status, and editable 2D lineup canvas.
- A confirmed bridesmaid sees only the shared 2D lineup canvas; it refreshes live while other confirmed looks appear.
- Bride dashboard updates are Supabase Realtime driven; the public canvas uses a lightweight 3-second server refresh so private session tokens are never exposed through public Realtime rows.
- Event deletion removes all event media from Supabase Storage and then deletes the event; database children cascade-delete.

## Storage

Create a **public** Supabase Storage bucket named `vto-renders`.
The existing folder structure is preserved:

- `user-photos/bride`
- `user-photos/bridesmaid`
- `catalog-dresses/bride`
- `user-dresses/bride`
- `user-dresses/bridesmaid`
- `vto-outputs/bride`
- `vto-outputs/bridesmaid`

The database stores stable Storage paths. Signed URL generation and signed URL parsing are not used.

## Database

Run `supabase/schema.sql` against the development database. The schema intentionally retires the old `bridal_looks` and `participants.vto_history` persistence model in favor of normalized tables.

## Environment

See `.env.example` for the required Supabase and YouCam variables.

## Validation

The source was syntax-transpiled successfully with the TypeScript compiler. A full `npm ci` / Next production build could not be executed in the provided environment because the configured package registry returned a 404 for the locked `zod` tarball.

## Bride Lineup Studio

The interactive 2D lineup uses Fabric.js loaded from jsDelivr at a pinned version (`fabric@6.7.1`). Lineup metadata is persisted in `participants`; the bride can also export the composed Fabric.js canvas as a PNG.
