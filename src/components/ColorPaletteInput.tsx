'use client';

import { useState } from 'react';
import type { SwatchColor } from '@/lib/types';

interface ColorPaletteProps {
  value?: SwatchColor[];
  onChange?: (colors: SwatchColor[]) => void;
  maxColors?: number;
}

// ── AZAZIE COLOR DATABASE & NESTED SHADES ──────────────────────────────────────
const COLOR_FAMILIES: Record<
  string,
  { label: string; heroHex: string; shades: SwatchColor[] }
> = {
  green: {
    label: 'Green',
    heroHex: '#9CAF88',
    shades: [
      { id: 'sage', name: 'Sage', hex: '#9CAF88', family: 'green' },
      { id: 'eucalyptus', name: 'Eucalyptus', hex: '#5F8575', family: 'green' },
      { id: 'emerald', name: 'Emerald', hex: '#046307', family: 'green' },
      { id: 'agave', name: 'Agave', hex: '#48685C', family: 'green' },
      { id: 'olive', name: 'Olive', hex: '#556B2F', family: 'green' },
      { id: 'dusty-sage', name: 'Dusty Sage', hex: '#B2C2A8', family: 'green' },
    ],
  },
  blue: {
    label: 'Blue',
    heroHex: '#7A9AAD',
    shades: [
      { id: 'dusty-blue', name: 'Dusty Blue', hex: '#7A9AAD', family: 'blue' },
      { id: 'dark-navy', name: 'Dark Navy', hex: '#111E38', family: 'blue' },
      { id: 'storm', name: 'Storm', hex: '#4A5B6D', family: 'blue' },
      { id: 'sky-blue', name: 'Sky Blue', hex: '#87CEEB', family: 'blue' },
      { id: 'steel-blue', name: 'Steel Blue', hex: '#4682B4', family: 'blue' },
      { id: 'royal-blue', name: 'Royal Blue', hex: '#104E8B', family: 'blue' },
    ],
  },
  pink: {
    label: 'Pink',
    heroHex: '#E8C5C8',
    shades: [
      { id: 'blushing-pink', name: 'Blushing Pink', hex: '#E8C5C8', family: 'pink' },
      { id: 'dusty-rose', name: 'Dusty Rose', hex: '#D24B64', family: 'pink' },
      { id: 'rose-petal', name: 'Rose Petal', hex: '#F4C2C2', family: 'pink' },
      { id: 'pearl-pink', name: 'Pearl Pink', hex: '#FADADD', family: 'pink' },
      { id: 'vintage-rose', name: 'Vintage Rose', hex: '#B87333', family: 'pink' },
    ],
  },
  purple: {
    label: 'Purple',
    heroHex: '#C9A0DC',
    shades: [
      { id: 'wisteria', name: 'Wisteria', hex: '#C9A0DC', family: 'purple' },
      { id: 'lavender', name: 'Lavender', hex: '#E6E6FA', family: 'purple' },
      { id: 'plum', name: 'Plum', hex: '#8E4585', family: 'purple' },
      { id: 'orchid', name: 'Orchid', hex: '#DA70D6', family: 'purple' },
      { id: 'grape', name: 'Grape', hex: '#6F2DA8', family: 'purple' },
    ],
  },
  red: {
    label: 'Red / Rust',
    heroHex: '#B83A24',
    shades: [
      { id: 'rust', name: 'Rust', hex: '#B83A24', family: 'red' },
      { id: 'terracotta', name: 'Terracotta', hex: '#C15C3D', family: 'red' },
      { id: 'merlot', name: 'Merlot', hex: '#73172C', family: 'red' },
      { id: 'burgundy', name: 'Burgundy', hex: '#6B0F24', family: 'red' },
      { id: 'cabernet', name: 'Cabernet', hex: '#520B1C', family: 'red' },
      { id: 'pomegranate', name: 'Pomegranate', hex: '#A31C37', family: 'red' },
    ],
  },
  neutral: {
    label: 'Neutral',
    heroHex: '#F7E7CE',
    shades: [
      { id: 'champagne', name: 'Champagne', hex: '#F7E7CE', family: 'neutral' },
      { id: 'sand', name: 'Sand', hex: '#C2B280', family: 'neutral' },
      { id: 'taupe', name: 'Taupe', hex: '#8B8589', family: 'neutral' },
      { id: 'ivory', name: 'Ivory', hex: '#FFFFF0', family: 'neutral' },
      { id: 'latte', name: 'Latte', hex: '#C5A059', family: 'neutral' },
    ],
  },
  jewel: {
    label: 'Jewel Tones',
    heroHex: '#0F52BA',
    shades: [
      { id: 'sapphire', name: 'Sapphire', hex: '#0F52BA', family: 'jewel' },
      { id: 'deep-emerald', name: 'Deep Emerald', hex: '#014421', family: 'jewel' },
      { id: 'ruby', name: 'Ruby', hex: '#E0115F', family: 'jewel' },
      { id: 'amethyst', name: 'Amethyst', hex: '#9966CC', family: 'jewel' },
    ],
  },
  dark: {
    label: 'Grey & Black',
    heroHex: '#36454F',
    shades: [
      { id: 'charcoal', name: 'Charcoal', hex: '#36454F', family: 'dark' },
      { id: 'slate', name: 'Slate', hex: '#708090', family: 'dark' },
      { id: 'silver', name: 'Silver', hex: '#C0C0C0', family: 'dark' },
      { id: 'black', name: 'Black', hex: '#111111', family: 'dark' },
    ],
  },
};

export default function ColorPaletteInput({
  value = [],
  onChange,
  maxColors = 5,
}: ColorPaletteProps) {
  const [activeFamilyKey, setActiveFamilyKey] = useState<string | null>(null);

  // Toggle shade selection
  const handleToggleShade = (shade: SwatchColor) => {
    const exists = value.some((item) => item.id === shade.id);
    if (exists) {
      onChange?.(value.filter((item) => item.id !== shade.id));
    } else {
      if (value.length >= maxColors) return; // Reached limit
      onChange?.([...value, shade]);
    }
  };

  // Remove a swatch directly from active tray
  const handleRemoveShade = (shadeId: string) => {
    onChange?.(value.filter((item) => item.id !== shadeId));
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-5">
      {/* ── Title & Counter Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-medium text-gray-800">
            Color palette
          </label>
          <p className="text-xs text-gray-500 mt-0.5">
            Select 1–{maxColors} complementary shades for your bridesmaid lineup
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 rounded-full text-gray-600">
          {value.length} / {maxColors} Selected
        </span>
      </div>

      {/* ── Active Palette Swatch Tray ── */}
      <div className="flex flex-wrap items-center gap-3 p-3.5 bg-gray-50/60 rounded-xl border border-gray-100 min-h-[64px]">
        {value.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            No shades selected yet. Click a color family below to add swatches.
          </p>
        ) : (
          value.map((swatch) => (
            <div
              key={swatch.id}
              className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 bg-white rounded-full border border-gray-200 shadow-sm animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Color Circle */}
              <div
                className="w-5 h-5 rounded-full border border-black/10 shadow-inner shrink-0"
                style={{ backgroundColor: swatch.hex }}
              />
              {/* Name & Hex Code */}
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-gray-800 leading-tight">
                  {swatch.name}
                </span>
                <span className="text-[9px] font-mono text-gray-400">
                  {swatch.hex}
                </span>
              </div>
              {/* Remove Button */}
              <button
                type="button"
                onClick={() => handleRemoveShade(swatch.id)}
                className="ml-1 w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors text-xs font-bold"
                title="Remove shade"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* ── Parent Category Circles (Azazie Style) ── */}
      <div>
        <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Browse Color Families
        </span>
        <div className="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-none">
          {Object.entries(COLOR_FAMILIES).map(([key, family]) => {
            const isActive = activeFamilyKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFamilyKey(isActive ? null : key)}
                className="flex flex-col items-center group cursor-pointer shrink-0 transition-transform active:scale-95"
              >
                {/* Circle Icon Wrapper */}
                <div
                  className={`w-12 h-12 rounded-full border-2 p-0.5 transition-all ${
                    isActive
                      ? 'border-rose-500 scale-105 shadow-sm'
                      : 'border-transparent hover:border-gray-300 hover:scale-105'
                  }`}
                >
                  <div
                    className="w-full h-full rounded-full shadow-inner"
                    style={{ backgroundColor: family.heroHex }}
                  />
                </div>
                {/* Label */}
                <span
                  className={`text-[11px] font-medium mt-1.5 transition-colors ${
                    isActive ? 'text-rose-600 font-semibold' : 'text-gray-700'
                  }`}
                >
                  {family.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

{/* ── Nested Shades Grid Drawer ── */}
{activeFamilyKey && (
  <div className="p-4 bg-rose-50/30 rounded-xl border border-rose-100 animate-in fade-in zoom-in-95 duration-150 space-y-3">
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
        {COLOR_FAMILIES[activeFamilyKey].label} Shades
      </span>
      <button
        type="button"
        onClick={() => setActiveFamilyKey(null)}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Close ✕
      </button>
    </div>

    {/* Responsive Grid: 2 cols on mobile, 3 on sm, 6 on md+ */}
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
      {COLOR_FAMILIES[activeFamilyKey].shades.map((shade) => {
        const isSelected = value.some((item) => item.id === shade.id);
        return (
          <button
            key={shade.id}
            type="button"
            onClick={() => handleToggleShade(shade)}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-center cursor-pointer ${
              isSelected
                ? 'border-rose-400 bg-white text-gray-900 shadow-sm ring-1 ring-rose-400/30'
                : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
            }`}
          >
            {/* Color Swatch Circle */}
            <div
              className="w-7 h-7 rounded-full border border-black/10 shrink-0 shadow-sm relative overflow-hidden mb-1.5"
              style={{ backgroundColor: shade.hex }}
            >
              {isSelected && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white text-[10px] font-bold">
                  ✓
                </div>
              )}
            </div>

            {/* Swatch Name (Full text, wraps if needed) */}
            <span className="text-xs font-semibold leading-tight text-gray-800">
              {shade.name}
            </span>

            {/* Hex Code */}
            <span className="text-[9px] text-gray-400 font-mono mt-0.5">
              {shade.hex}
            </span>
          </button>
        );
      })}
    </div>
  </div>
)}
    </div>
  );
}
