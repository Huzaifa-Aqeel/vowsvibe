/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16's CLI type-check worker can produce empty captured output in some
  // Linux build environments. Use the stable compiler API; `tsc --noEmit` is
  // also run separately in CI/local verification.
  experimental: { useTypeScriptCli: false },

  // Lets the dev server serve /_next/* assets when the app is opened through an ngrok
  // tunnel instead of localhost. This only silences the dev-time cross-origin warning —
  // it does NOT fix Supabase auth cookies not carrying over between origins (cookies are
  // scoped to the origin they were set on; log in from the same origin you're testing on).
  // Free ngrok subdomains change on every restart, so update this value each time.
  allowedDevOrigins: ["race-reliable-mumble.ngrok-free.dev"],

  // onnxruntime-node (pulled in by @imgly/background-removal-node) ships a prebuilt
  // native .node binary per platform. Webpack tries to statically parse every file behind
  // the package's dynamic require() and fails on the binary itself ("Unexpected character").
  // Marking both packages external tells Next.js to skip bundling them and instead resolve
  // them with plain Node `require` at runtime, same as any other native addon (sharp,
  // sqlite3, etc. — see Next's own docs, which list onnxruntime-node as a known example).
  serverExternalPackages: ["onnxruntime-node", "@imgly/background-removal-node"],

  // IMG.LY resolves its model manifest and hashed model files dynamically at runtime,
  // so Next's static tracer cannot discover them from the package entry point. Keep
  // these assets alongside only the two functions that perform cutout extraction.
  outputFileTracingIncludes: {
    "/api/bridal-look/[lookId]/confirm": [
      "./node_modules/@imgly/background-removal-node/dist/**/*",
    ],
    "/api/participants/[participantId]": [
      "./node_modules/@imgly/background-removal-node/dist/**/*",
    ],
  },
};

export default nextConfig;
