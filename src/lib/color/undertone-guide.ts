import type { Undertone } from "@/lib/color/undertone";

export interface GuideSwatch {
  name: string;
  hex: string;
}

export interface UndertoneGuide {
  flattering: GuideSwatch[];
  caution: GuideSwatch[];
}

// A small, curated reference palette per undertone, shown to a bride/bridesmaid right after
// her skin tone is read. Hex values are drawn from named-color reference sites (colorxs.com)
// where available, chosen to represent the same warm/cool/neutral styling guidance the dress
// analyzer itself is calibrated against — the two stay consistent because both are read from
// the same underlying style rules, not because one drives the other.
export const UNDERTONE_COLOR_GUIDE: Record<Undertone, UndertoneGuide> = {
  warm: {
    flattering: [
      { name: "Terracotta", hex: "#E2725B" },
      { name: "Burnt Orange", hex: "#CC5500" },
      { name: "Warm Gold", hex: "#D4AF37" },
      { name: "Coral", hex: "#FF7F50" },
      { name: "Olive Green", hex: "#87965A" },
      { name: "Amber", hex: "#FFBF00" },
    ],
    caution: [
      { name: "Icy Blue", hex: "#A6C8E0" },
      { name: "Cool Fuchsia", hex: "#C2185B" },
      { name: "Silver", hex: "#C0C0C0" },
      { name: "Stark White", hex: "#FFFFFF" },
    ],
  },
  cool: {
    flattering: [
      { name: "Navy", hex: "#1B2A4A" },
      { name: "Sapphire", hex: "#0F52BA" },
      { name: "Royal Purple", hex: "#5D3FD3" },
      { name: "Raspberry", hex: "#E30B5D" },
      { name: "Emerald Mint", hex: "#3EB489" },
      { name: "Periwinkle", hex: "#CCCCFF" },
    ],
    caution: [
      { name: "Warm Orange", hex: "#FFA500" },
      { name: "Golden Mustard", hex: "#E1AD01" },
      { name: "Warm Camel", hex: "#C19A6B" },
      { name: "Warm Ivory", hex: "#FFF8E7" },
    ],
  },
  neutral: {
    flattering: [
      { name: "Greige", hex: "#B0A999" },
      { name: "Warm Stone", hex: "#A89684" },
      { name: "Sage Green", hex: "#9CAF88" },
      { name: "Dusty Rose", hex: "#C08497" },
      { name: "Soft Teal", hex: "#6B9C99" },
      { name: "Camel", hex: "#C19A6B" },
    ],
    caution: [
      { name: "Icy Pastel Blue", hex: "#89CFF0" },
      { name: "Neon Orange", hex: "#FF6600" },
      { name: "Stark White", hex: "#FFFFFF" },
      { name: "Flat Gray-Beige", hex: "#E8DFD3" },
    ],
  },
};
