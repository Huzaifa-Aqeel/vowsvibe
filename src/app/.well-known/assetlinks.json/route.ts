import { NextResponse } from "next/server";

export function GET() {
  const fingerprints = (process.env.ANDROID_APP_LINK_SHA256 ?? "").split(",").map((value) => value.trim()).filter((value) => /^(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/.test(value));
  return NextResponse.json(fingerprints.length ? [{ relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: "com.vowsvibe.mobile", sha256_cert_fingerprints: fingerprints } }] : []);
}
