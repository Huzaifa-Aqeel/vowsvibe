const METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
/** Exact origins only; mobile clients use Authorization rather than browser cookies. */
export function mobileCorsHeaders(origin: string | null, configuredOrigins: string) {
  if (!origin) return null;
  const allowed = configuredOrigins.split(",").map((value) => value.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return { "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": METHODS,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, ngrok-skip-browser-warning",
    "Access-Control-Max-Age": "600", Vary: "Origin" };
}
