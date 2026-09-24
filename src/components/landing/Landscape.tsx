import { useId } from 'react';

/**
 * Generated landscape thumbnails.
 *
 * The catalogue holds no photographs, so cards get an illustrated scene
 * chosen from their themes instead of an empty box. The scenes are
 * decorative: they carry no information the card text does not, so they are
 * hidden from assistive technology. When real photos exist, the card image
 * slot can swap this component out without touching the card layout.
 */

export type Scene = 'hills' | 'water' | 'temple' | 'forest';

const PALETTES: Record<
  Scene,
  { skyTop: string; skyBottom: string; far: string; mid: string; near: string }
> = {
  hills: { skyTop: '#cfe8f7', skyBottom: '#eef8fb', far: '#a3cfc6', mid: '#62a898', near: '#2f7d6d' },
  water: { skyTop: '#c5e3f5', skyBottom: '#eef7fb', far: '#93c2d9', mid: '#5aa3b9', near: '#1f7a8c' },
  temple: { skyTop: '#fde5c2', skyBottom: '#fff6e8', far: '#e9bd8f', mid: '#cf9663', near: '#8a9760' },
  forest: { skyTop: '#d3ebdb', skyBottom: '#f0f9f3', far: '#93c8a5', mid: '#43986a', near: '#1f6b47' },
};

/** Picks a scene from a destination's theme tags, falling back to hills. */
export function sceneForThemes(themes: readonly string[] | undefined, fallback: Scene = 'hills'): Scene {
  const joined = (themes ?? []).join(' ').toLowerCase();

  if (/(lake|water|river|dam|reservoir|boat)/.test(joined)) return 'water';
  if (/(heritage|culture|temple|history|city|fort)/.test(joined)) return 'temple';
  if (/(wildlife|forest|jungle|trek|waterfall|birding)/.test(joined)) return 'forest';
  return fallback;
}

const ROTATION: Scene[] = ['hills', 'water', 'forest', 'temple'];

/** A stable scene for items that have no theme tags, chosen by position. */
export function sceneForIndex(index: number): Scene {
  return ROTATION[index % ROTATION.length]!;
}

export function Landscape({ scene, className }: { scene: Scene; className?: string }) {
  const id = useId().replace(/:/g, '');
  const p = PALETTES[scene];

  return (
    <svg
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'h-full w-full'}
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.skyTop} />
          <stop offset="1" stopColor={p.skyBottom} />
        </linearGradient>
      </defs>

      <rect width="400" height="240" fill={`url(#${id}-sky)`} />
      <circle cx="312" cy="62" r="24" fill="#ffffff" opacity="0.85" />
      <ellipse cx="90" cy="54" rx="42" ry="9" fill="#ffffff" opacity="0.75" />
      <ellipse cx="130" cy="64" rx="30" ry="7" fill="#ffffff" opacity="0.65" />

      <path d="M0 150C60 108 112 132 172 104S300 88 400 130V240H0Z" fill={p.far} />
      <path d="M0 176C70 140 130 172 200 146S330 132 400 166V240H0Z" fill={p.mid} />

      {scene === 'temple' && (
        <g fill="#b5673a">
          <path d="M150 178h60v-14h-6v-16h-8v-16h-8v-16h-8v-16h-4v16h-8v16h-8v16h-8v16h-6z" />
          <rect x="168" y="166" width="10" height="12" fill="#7a3f1d" />
        </g>
      )}

      {scene === 'water' && (
        <g>
          <rect x="0" y="176" width="400" height="64" fill={p.mid} />
          <path d="M20 196h70M120 210h90M240 198h80M300 218h70" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
          <path d="M210 190l30 0-6 9h-18z" fill="#ffffff" opacity="0.9" />
          <path d="M225 190v-16l12 16z" fill="#f4b183" />
        </g>
      )}

      <path d="M0 206C80 180 150 212 240 190S350 186 400 202V240H0Z" fill={p.near} />

      {scene === 'forest' && (
        <g fill="#14523a">
          <path d="M40 210l16-38 16 38zM62 214l14-32 14 32zM300 208l18-42 18 42zM330 214l14-30 14 30z" />
        </g>
      )}

      {scene === 'hills' && (
        <g stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2.5" fill="none" strokeLinecap="round">
          <path d="M20 214c40-14 80-14 120 0M180 220c40-14 80-14 120 0M40 228c60-12 120-12 180 0" />
        </g>
      )}
    </svg>
  );
}
