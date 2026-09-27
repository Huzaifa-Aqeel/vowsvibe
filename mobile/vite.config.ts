import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "next/navigation", replacement: fileURLToPath(new URL("./src/compat/navigation.tsx", import.meta.url)) },
      { find: "next/link", replacement: fileURLToPath(new URL("./src/compat/link.tsx", import.meta.url)) },
      { find: "next/image", replacement: fileURLToPath(new URL("./src/compat/image.tsx", import.meta.url)) },
      { find: "@/lib/supabase/client", replacement: fileURLToPath(new URL("./src/platform/supabase.ts", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("../src", import.meta.url)) },
    ],
    dedupe: ["react", "react-dom", "lucide-react", "clsx", "tailwind-merge", "@supabase/ssr", "@supabase/supabase-js"],
  },
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  build: { target: "es2022", sourcemap: false },
});
