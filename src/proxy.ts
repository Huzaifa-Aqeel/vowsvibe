import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { mobileCorsHeaders } from "@/lib/platform/cors";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });
  if (request.nextUrl.pathname.startsWith("/api/")) {
    response.headers.set("Vary", "Origin");
    const cors = mobileCorsHeaders(request.headers.get("origin"), process.env.MOBILE_ALLOWED_ORIGINS ?? "");
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: cors ? 204 : 403, headers: cors ?? { Vary: "Origin" } });
    }
    // API handlers verify bearer tokens themselves. Cookie refresh remains on web pages.
    if (cors) Object.entries(cors).forEach(([key, value]) => response.headers.set(key, value));
    if (request.headers.has("authorization") || cors) return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // Refreshes the session cookie if needed — keeps the bride logged in across visits.
  await supabase.auth.getUser();
  if (request.nextUrl.pathname.startsWith("/api/")) response.headers.set("Vary", "Origin");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
