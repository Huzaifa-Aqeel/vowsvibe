'use client';

import { useState } from 'react';

export type DressLength = 'short' | 'long' | 'ankle' | 'floor';

interface DressLengthSelectorProps {
  value?: DressLength;
  onChange?: (length: DressLength) => void;
}

// Crisp Vector Dress Line Art
const LengthIcons = {
  short: (
    <svg viewBox="0 0 100 120" className="w-12 h-14 stroke-gray-700 fill-none stroke-[2]" strokeLinecap="round" strokeLinejoin="round">
      <path d="M40 22 L45 12 L55 12 L60 22 L68 52 L32 52 Z" className="fill-gray-50" />
      <path d="M42 52 L40 92 M40 92 L37 99 M58 52 L60 92 M60 92 L63 99" />
    </svg>
  ),
  long: (
    <svg viewBox="0 0 100 120" className="w-12 h-14 stroke-gray-700 fill-none stroke-[2]" strokeLinecap="round" strokeLinejoin="round">
      <path d="M40 22 L45 12 L55 12 L60 22 L70 72 L30 72 Z" className="fill-gray-50" />
      <path d="M42 72 L40 96 M40 96 L37 101 M58 72 L60 96 M60 96 L63 101" />
    </svg>
  ),
  ankle: (
    <svg viewBox="0 0 100 120" className="w-12 h-14 stroke-gray-700 fill-none stroke-[2]" strokeLinecap="round" strokeLinejoin="round">
      <path d="M40 22 L45 12 L55 12 L60 22 L72 86 L28 86 Z" className="fill-gray-50" />
      <path d="M41 86 L38 96 M59 86 L62 96" />
    </svg>
  ),
  floor: (
    <svg viewBox="0 0 100 120" className="w-12 h-14 stroke-gray-700 fill-none stroke-[2]" strokeLinecap="round" strokeLinejoin="round">
      <path d="M40 22 L45 12 L55 12 L60 22 L75 100 L25 100 Z" className="fill-gray-50" />
    </svg>
  ),
};

const LENGTH_OPTIONS: { id: DressLength; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'long', label: 'Long' },
  { id: 'ankle', label: 'Ankle-Length' },
  { id: 'floor', label: 'Floor-Length' },
];

export default function DressLengthSelector({
  value = 'floor',
  onChange,
}: DressLengthSelectorProps) {
  const [selected, setSelected] = useState<DressLength>(value);

  const handleSelect = (id: DressLength) => {
    setSelected(id);
    if (onChange) onChange(id);
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-3">
      {/* Label matching Event Name / Color palette titles */}
      <label className="block text-sm font-medium text-gray-800">
        Dress length
      </label>

      {/* 4-Column Horizontal Card Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {LENGTH_OPTIONS.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleSelect(option.id)}
              className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'border-rose-400 bg-rose-50/20 text-gray-900 shadow-sm'
                  : 'border-gray-200 hover:border-gray-300 bg-white text-gray-600'
              }`}
            >
              {/* Dress Illustration */}
              <div className="my-1">{LengthIcons[option.id]}</div>

              {/* Title */}
              <span className={`text-xs font-medium mt-1 ${isSelected ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}