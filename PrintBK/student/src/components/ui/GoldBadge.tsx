import React from 'react';

export type GoldBadgeName =
  | 'about'
  | 'clear'
  | 'contact'
  | 'help'
  | 'history'
  | 'language'
  | 'notifications'
  | 'phone'
  | 'presets'
  | 'privacy'
  | 'shop'
  | 'theme';

interface GoldBadgeProps {
  name: GoldBadgeName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}

const GLYPH_PATHS: Record<GoldBadgeName, string> = {
  about: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  clear: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  contact: 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  help: 'M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z',
  history: 'M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
  language: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z',
  notifications: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  phone: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
  presets: 'M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z',
  privacy: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1.5 15l-3.5-3.5 1.4-1.4 2.1 2.1 5.1-5.1 1.4 1.4-6.5 6.5z',
  shop: 'M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z',
  theme: 'M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z',
};

export const GoldBadge: React.FC<GoldBadgeProps> = ({
  name,
  size = 44,
  className = '',
  style = {},
  ariaLabel,
}) => {
  const glyph = GLYPH_PATHS[name] || GLYPH_PATHS.about;
  const showSparkle = size >= 56;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={`gold-badge ${className}`.trim()}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      role="img"
      aria-label={ariaLabel || name}
    >
      <defs>
        <linearGradient id="pbk-gold-ring" x1="0.1" y1="0.05" x2="0.9" y2="0.95">
          <stop offset="0%" stopColor="#FFF4B8" />
          <stop offset="20%" stopColor="#E8C55C" />
          <stop offset="40%" stopColor="#A27A12" />
          <stop offset="58%" stopColor="#F6DC82" />
          <stop offset="78%" stopColor="#B8860B" />
          <stop offset="100%" stopColor="#6A4C00" />
        </linearGradient>

        <linearGradient id="pbk-gold-ringin" x1="0.9" y1="0.95" x2="0.1" y2="0.05">
          <stop offset="0%" stopColor="#FFF4B8" />
          <stop offset="50%" stopColor="#8A6A00" />
          <stop offset="100%" stopColor="#FFE9A0" />
        </linearGradient>

        <radialGradient id="pbk-gold-disc" cx="0.38" cy="0.28" r="0.85">
          <stop offset="0%" stopColor="#4A4230" />
          <stop offset="45%" stopColor="#17140C" />
          <stop offset="100%" stopColor="#050505" />
        </radialGradient>

        <linearGradient id="pbk-gold-gly" gradientUnits="userSpaceOnUse" x1="40" y1="38" x2="80" y2="82">
          <stop offset="0%" stopColor="#F8E08E" />
          <stop offset="38%" stopColor="#D9AE2E" />
          <stop offset="72%" stopColor="#A97C0A" />
          <stop offset="100%" stopColor="#7A5800" />
        </linearGradient>

        <clipPath id="pbk-gold-clip">
          <circle cx="60" cy="60" r="49" />
        </clipPath>

        <filter id="pbk-gold-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>

        <filter id="pbk-gold-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* Drop shadow */}
      <circle cx="60" cy="64" r="55" fill="#000" opacity="0.28" filter="url(#pbk-gold-soft)" />

      {/* Dark outer rim */}
      <circle cx="60" cy="60" r="58" fill="none" stroke="#4A3600" strokeOpacity="0.55" strokeWidth="1" />

      {/* Beveled glossy metallic gold ring */}
      <circle cx="60" cy="60" r="53.5" fill="none" stroke="url(#pbk-gold-ring)" strokeWidth="9" />

      {/* Inner highlight ring */}
      <circle cx="60" cy="60" r="49.2" fill="none" stroke="url(#pbk-gold-ringin)" strokeWidth="1.8" opacity="0.95" />

      {/* Black glass disc center */}
      <circle cx="60" cy="60" r="50" fill="url(#pbk-gold-disc)" />

      {/* Soft curved glass reflection */}
      <g clipPath="url(#pbk-gold-clip)">
        <ellipse cx="52" cy="36" rx="34" ry="17" fill="#FFFFFF" opacity="0.085" />
      </g>

      {/* Glyph drop shadow for depth */}
      <g transform="translate(60,61.5) scale(1.68) translate(-12,-12)" fill="#2A1F00" opacity="0.9">
        <path d={glyph} />
      </g>

      {/* Gold metallic glyph */}
      <g transform="translate(60,60) scale(1.68) translate(-12,-12)">
        <path d={glyph} fill="url(#pbk-gold-gly)" />
      </g>

      {/* 4-point sparkle highlight on upper right (>= 56px) */}
      {showSparkle && (
        <>
          <g filter="url(#pbk-gold-glow)">
            <path d="M98 8 L100.4 19.6 L112 22 L100.4 24.4 L98 36 L95.6 24.4 L84 22 L95.6 19.6 Z" fill="#FFFBE6" />
          </g>
          <path d="M98 11 L99.9 20.1 L109 22 L99.9 23.9 L98 33 L96.1 23.9 L87 22 L96.1 20.1 Z" fill="#FFFFFF" />
        </>
      )}
    </svg>
  );
};

export default GoldBadge;
