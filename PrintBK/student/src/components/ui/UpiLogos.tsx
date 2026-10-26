import React from 'react';

/**
 * Authentic vector logos for Indian digital payments & UPI ecosystem.
 * Crisp, scalable, Retina-ready SVG components with zero external dependencies.
 */

// 1. Official NPCI UPI Logo (Dual Arrow Emblem)
export function UpiLogo({ size = 28, className = '' }: { size?: number; className?: string }) {
  const height = size;
  const width = Math.round(size * 2.2);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 110 50"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="UPI logo"
    >
      {/* Background Pill */}
      <rect width="110" height="50" rx="10" fill="#0B132B" />
      {/* Green Left Arrow */}
      <path d="M42 9L27 25L42 41L49 41L34 25L49 9H42Z" fill="#00B050" />
      {/* Orange Right Arrow */}
      <path d="M52 9L37 25L52 41L59 41L44 25L59 9H52Z" fill="#F37021" />
      {/* UPI Text */}
      <text
        x="63"
        y="33"
        fill="#FFFFFF"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="21"
        letterSpacing="1"
      >
        UPI
      </text>
    </svg>
  );
}

// 2. Official Google Pay (GPay) Logo
export function GPayLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Google Pay logo"
    >
      <rect width="48" height="48" rx="12" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" />
      {/* Google G Symbol */}
      <path
        d="M36.6 24.5c0-.8-.1-1.7-.2-2.5H24v4.9h7.1c-.3 1.6-1.2 3.1-2.6 4l4.2 3.3c2.4-2.3 3.9-5.6 3.9-9.7z"
        fill="#4285F4"
      />
      <path
        d="M24 37.3c3.6 0 6.6-1.2 8.8-3.3l-4.2-3.3c-1.2.8-2.7 1.3-4.6 1.3-3.5 0-6.6-2.4-7.6-5.6l-4.4 3.4c2.2 4.3 6.6 7.5 12 7.5z"
        fill="#34A853"
      />
      <path
        d="M16.4 26.4c-.3-.8-.4-1.6-.4-2.4s.1-1.7.4-2.4l-4.4-3.4c-.9 1.8-1.4 3.7-1.4 5.8s.5 4 1.4 5.8l4.4-3.4z"
        fill="#FBBC05"
      />
      <path
        d="M24 15.5c2 0 3.7.7 5.1 2l3.8-3.8c-2.3-2.2-5.4-3.5-8.9-3.5-5.4 0-9.8 3.2-12 7.5l4.4 3.4c1-3.2 4.1-5.6 7.6-5.6z"
        fill="#EA4335"
      />
    </svg>
  );
}

// 3. Official PhonePe Logo
export function PhonePeLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="PhonePe logo"
    >
      <rect width="48" height="48" rx="12" fill="#5F259F" />
      {/* Devanagari Pe Glyph */}
      <path
        d="M27.2 13h-6.8c-.8 0-1.4.6-1.4 1.4v19.2c0 .8.6 1.4 1.4 1.4h3.2c.8 0 1.4-.6 1.4-1.4v-6.3h2.2c5.6 0 9.8-3.6 9.8-9.1 0-5.6-4.2-9.2-9.8-9.2zm-.1 12.3h-2.1v-6.5h2.1c2.4 0 4.1 1.4 4.1 3.2 0 1.9-1.7 3.3-4.1 3.3z"
        fill="#FFFFFF"
      />
      <path
        d="M16 13h17c.6 0 1 .4 1 1s-.4 1-1 1H16c-.6 0-1-.4-1-1s.4-1 1-1z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

// 4. Official Paytm Logo
export function PaytmLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={Math.round(size * 1.5)}
      height={size}
      viewBox="0 0 64 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Paytm logo"
    >
      <rect width="64" height="36" rx="8" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.2" />
      <text
        x="6"
        y="25"
        fill="#002970"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="17"
        letterSpacing="-0.5"
      >
        Pay
      </text>
      <text
        x="36"
        y="25"
        fill="#00BAF2"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="17"
        letterSpacing="-0.5"
      >
        tm
      </text>
    </svg>
  );
}

// 5. Official BHIM UPI Logo
export function BhimLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="BHIM logo"
    >
      <rect width="48" height="48" rx="12" fill="#002D62" />
      <path d="M14 10L24 24L14 38H20L30 24L20 10H14Z" fill="#00A859" />
      <path d="M26 10L36 24L26 38H32L42 24L32 10H26Z" fill="#F58220" />
      <text
        x="8"
        y="44"
        fill="#FFFFFF"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="9"
      >
        BHIM
      </text>
    </svg>
  );
}

// 6. Cash at Counter Icon (Green Banknote Emblem)
export function CashIcon({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Cash logo"
    >
      <rect width="48" height="48" rx="12" fill="#ECFDF5" border="1.5px solid #A7F3D0" />
      <rect x="8" y="14" width="32" height="20" rx="4" fill="#059669" />
      <circle cx="24" cy="24" r="5" fill="#A7F3D0" />
      <text
        x="21"
        y="28"
        fill="#047857"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="12"
      >
        ₹
      </text>
    </svg>
  );
}

// 7. UPI App Badges Bar (Shows all supported apps in a neat inline strip)
export function UpiAppStrip({ size = 22 }: { size?: number }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <GPayLogo size={size} />
      <PhonePeLogo size={size} />
      <PaytmLogo size={size} />
      <BhimLogo size={size} />
    </div>
  );
}
