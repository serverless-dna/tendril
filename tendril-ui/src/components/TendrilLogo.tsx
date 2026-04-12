import React from 'react';

// 16x16 pixel art — small body, tendrils radiating all sides, no eyes
const pixels = [
  '....P...P...P...',
  '...P.P.P.P.P.P..',
  '..P..P...P..P...',
  '..P..PPPPP..P...',
  '.P..PPPPPPP..P..',
  '.P.PPPPPPPPP.P..',
  'P..PPPPPPPPP..P.',
  '...PPPPPPPPP....',
  'P..PPPPPPPPP..P.',
  '.P.PPPPPPPPP.P..',
  '.P..PPPPPPP..P..',
  '..P..PPPPP..P...',
  '..P..P...P..P...',
  '...P.P.P.P.P....',
  '....P...P...P...',
  '................',
];

const colors: Record<string, string> = {
  P: '#7C5CBF',
  '.': 'transparent',
};

interface TendrilLogoProps {
  size?: number;
  className?: string;
}

export function TendrilLogo({ size = 128, className = '' }: TendrilLogoProps) {
  const gridW = 16;
  const gridH = pixels.length;

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
