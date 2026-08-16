'use client';

import { useState, useEffect } from 'react';

// ── 1. PRESERVE ORIGINAL EXPORTED TYPE (Zero Breaking Changes) ───────────────
export type FabricType = 'chiffon' | 'satin' | 'mesh' | 'crepe' | 'velvet' | 'flexible';

export interface FabricSubOption {
  id: string;
  label: string;
  description: string;
}

export interface FabricSelectorProps {
  /** Accepts parent type (e.g., 'satin') or sub-type (e.g., 'stretch-satin') */
  value?: FabricType | string;
  /** Optional secondary value if your form tracks sub-fabrics separately */
  subValue?: string;
  /** Backward compatible: 1st arg is parent FabricType, 2nd arg is subFabric id */
  onChange?: (fabric: FabricType, subFabric?: string) => void;
}

// ── 2. AZAZIE TAXONOMY MATRIX (Preserves original titles & badges) ───────────
const AZAZIE_FABRIC_TAXONOMY: Record<
  FabricType,
  {
    label: string;
    description: string;
    badge: string;
    subTypes: FabricSubOption[];
  }
> = {
  chiffon: {
    label: 'Chiffon',
    description: 'Light, airy, flowy drape',
    badge: 'Most Popular',
    subTypes: [
      { id: 'chiffon-classic', label: 'Classic Chiffon', description: 'Azazie standard lightweight flowy drape' },
      { id: 'crinkle-chiffon', label: 'Crinkle Chiffon', description: 'Micro-pleated surface texture' },
      { id: 'floral-chiffon', label: 'Floral Chiffon', description: 'Printed botanical overlay on chiffon' },
    ],
  },
  satin: {
    label: 'Satin',
    description: 'Luxurious sheen & structure',
    badge: 'Formal',
    subTypes: [
      { id: 'stretch-satin', label: 'Stretch Satin', description: 'Azazie signature body-skimming flexible sheen' },
      { id: 'matte-satin', label: 'Matte Satin', description: 'Soft reduced-glare luster for photography' },
      { id: 'charmeuse', label: 'Charmeuse Satin', description: 'Ultra-liquid glossy fluid drape' },
    ],
  },
  mesh: {
    label: 'Stretch Mesh',
    description: 'Soft, flexible, body-skimming',
    badge: 'Modern',
    subTypes: [
      { id: 'stretch-mesh', label: 'Stretch Mesh', description: 'Ultra-soft contouring mesh fabric' },
      { id: 'tulle', label: 'Fine Tulle', description: 'Airy netting skirts & illusion panels' },
    ],
  },
  crepe: {
    label: 'Crepe',
    description: 'Matte, sleek minimalist lines',
    badge: 'Chic',
    subTypes: [
      { id: 'stretch-crepe', label: 'Stretch Crepe', description: 'Pebbled texture with body-holding stretch' },
      { id: 'scuba-crepe', label: 'Scuba Crepe', description: 'Thicker, smoothing structured fit' },
    ],
  },
  velvet: {
    label: 'Velvet',
    description: 'Rich, plush, warm texture',
    badge: 'Fall/Winter',
    subTypes: [
      { id: 'stretch-velvet', label: 'Stretch Velvet', description: 'Azazie plush 4-way stretch velvet' },
      { id: 'embossed-velvet', label: 'Patterned Velvet', description: 'Burnout floral texture detailing' },
    ],
  },
  flexible: {
    label: 'Any / Flexible',
    description: 'Bridesmaids pick their own',
    badge: 'Casual',
    subTypes: [
      { id: 'flexible-any', label: 'Fully Flexible', description: 'Bridesmaids mix-and-match fabrics freely' },
    ],
  },
};

// Helper to resolve parent FabricType from either parent ID or sub-type slug
function resolveFabricParent(val: string): { parent: FabricType; subId: string } {
  const cleanVal = val.toLowerCase();

  // Direct parent match
  if (cleanVal in AZAZIE_FABRIC_TAXONOMY) {
    const p = cleanVal as FabricType;
    return { parent: p, subId: AZAZIE_FABRIC_TAXONOMY[p].subTypes[0].id };
  }

  // Search through sub-types
  for (const [parentKey, config] of Object.entries(AZAZIE_FABRIC_TAXONOMY)) {
    const match = config.subTypes.find((s) => s.id === cleanVal || cleanVal.includes(s.id));
    if (match) {
      return { parent: parentKey as FabricType, subId: match.id };
    }
  }

  return { parent: 'chiffon', subId: 'chiffon-classic' };
}

export default function FabricSelector({
  value = 'chiffon',
  subValue,
  onChange,
}: FabricSelectorProps) {
  // Parse initial state safely
  const { parent: initialParent, subId: initialSub } = resolveFabricParent(value);
  
  const [selectedParent, setSelectedParent] = useState<FabricType>(initialParent);
  const [selectedSub, setSelectedSub] = useState<string>(subValue || initialSub);
  const [activeDrawerParent, setActiveDrawerParent] = useState<FabricType | null>(initialParent);

  // Sync state if external prop changes (e.g. link auto-inferred from URL)
  useEffect(() => {
    const { parent, subId } = resolveFabricParent(value);
    setSelectedParent(parent);
    setSelectedSub(subValue || subId);
    setActiveDrawerParent(parent);
  }, [value, subValue]);

  // Handle parent card click
  const handleParentClick = (key: FabricType) => {
    const defaultSubId = AZAZIE_FABRIC_TAXONOMY[key].subTypes[0].id;
    setSelectedParent(key);
    setSelectedSub(defaultSubId);
    setActiveDrawerParent(key);

    // Call onChange with 1st arg = parent, 2nd arg = sub-type
    onChange?.(key, defaultSubId);
  };

  // Handle sub-type drawer selection
  const handleSubClick = (subId: string) => {
    setSelectedSub(subId);
    onChange?.(selectedParent, subId);
  };

  const currentSubLabel = AZAZIE_FABRIC_TAXONOMY[selectedParent]?.subTypes.find(
    (s) => s.id === selectedSub
  )?.label;

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
      {/* ── Title & Subtitle (Original Design Intact) ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="block text-sm font-medium text-gray-800">
            Fabric requirement
          </label>
          {currentSubLabel && (
            <span className="text-[11px] font-semibold px-2.5 py-0.5 bg-rose-50 text-rose-700 rounded-full border border-rose-100">
              {currentSubLabel}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 hidden sm:inline">
          Ensures photo-lighting consistency
        </span>
      </div>

      {/* ── 6-Column Card Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {(Object.keys(AZAZIE_FABRIC_TAXONOMY) as FabricType[]).map((key) => {
          const option = AZAZIE_FABRIC_TAXONOMY[key];
          const isSelected = selectedParent === key;
          const isDrawerOpen = activeDrawerParent === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => handleParentClick(key)}
              className={`flex flex-col text-left p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                isSelected || isDrawerOpen
                  ? 'border-rose-400 bg-rose-50/20 text-gray-900 shadow-sm ring-1 ring-rose-400/20'
                  : 'border-gray-200 hover:border-gray-300 bg-white text-gray-600'
              }`}
            >
              {/* Category Badge */}
              <span
                className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md w-fit mb-2 ${
                  isSelected
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {option.badge}
              </span>

              {/* Fabric Name */}
              <span
                className={`text-xs font-semibold ${
                  isSelected ? 'text-gray-900' : 'text-gray-800'
                }`}
              >
                {option.label}
              </span>

              {/* Description */}
              <span className="text-[10px] text-gray-500 mt-1 leading-tight">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Sub-Taxonomy Drawer (Matches ColorPalette.tsx UI) ── */}
      {activeDrawerParent && AZAZIE_FABRIC_TAXONOMY[activeDrawerParent].subTypes.length > 0 && (
        <div className="p-4 bg-rose-50/30 rounded-xl border border-rose-100 animate-in fade-in zoom-in-95 duration-150 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
              {AZAZIE_FABRIC_TAXONOMY[activeDrawerParent].label} Variations
            </span>
            <button
              type="button"
              onClick={() => setActiveDrawerParent(null)}
              className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              Close ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {AZAZIE_FABRIC_TAXONOMY[activeDrawerParent].subTypes.map((sub) => {
              const isSubSelected = selectedSub === sub.id && selectedParent === activeDrawerParent;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => handleSubClick(sub.id)}
                  className={`flex flex-col text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSubSelected
                      ? 'border-rose-400 bg-white text-gray-900 shadow-sm ring-1 ring-rose-400/30'
                      : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-semibold text-gray-800">{sub.label}</span>
                    {isSubSelected && <span className="text-rose-500 text-xs font-bold">✓</span>}
                  </div>
                  <span className="text-[10px] text-gray-400 mt-0.5">{sub.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}