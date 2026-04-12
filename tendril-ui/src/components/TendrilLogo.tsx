import React from 'react';

// 16x16 pixel art octopus, rendered as SVG rects for crisp scaling
const pixels = [
  '......PPPP......',
  '....PPPPPPPP....',
  '...PPPPPPPPPP...',
  '..PPPPPPPPPPPP..',
  '..PPEEPPPPEEPP..',
  '..PBEPPPPBEPPP..',
  '..PPEEPPPPEEPP..',
  '..PPPPMMPPPPP...',
  '..PPPPMMMPPPPP..',
  '...PPPPPPPPPP...',
  '..PPPPDPPPPDPP..',
  '..PPDDDPPDDPPP..',
  '.PPDDTDPDDTDPP.',
  '.PDDTTDDDTTDPP.',
  '.PDTTTPPPDTTTPP.',
  '..PTTTPPPPTTTPP.',
];

const colors: Record<string, string> = {
  P: '#5842B4',  // purple body
  D: '#3A2A82',  // dark purple tentacles
  E: '#FFFFFF',  // eye white
  B: '#14141E',  // eye pupil
  M: '#C864A0',  // mouth accent
  T: 'transparent',
  '.': 'transparent',
};

interface TendrilLogoProps {
  size?: number;
  className?: string;
}

export function TendrilLogo({ size = 128, className = '' }: TendrilLogoProps) {
  const gridW = 16;
  const gridH = pixels.length;
  const cellSize = size / gridW;

  return (
    <svg
      width={size}
      height={(gridH / gridW) * size}
      viewBox={`0 0 ${gridW} ${gridH}`}
      className={className}
      style={{ imageRendering: 'pixelated' }}
    >
      {pixels.map((row, y) =>
        row.split('').map((c, x) => {
          const color = colors[c];
          if (!color || color === 'transparent') return null;
          return (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={1}
              height={1}
              fill={color}
            />
          );
        }),
      )}
    </svg>
  );
}
