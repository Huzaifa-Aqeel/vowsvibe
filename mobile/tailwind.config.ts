import webConfig from "../tailwind.config";
export default { ...webConfig, content: ["./index.html", "./src/**/*.{ts,tsx}", "../src/components/**/*.{ts,tsx}"] };
