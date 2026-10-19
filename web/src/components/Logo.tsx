// Our own mark: a coin riding on two rails. (Colours inspired by Freecash; not their logo.)
export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--green)" />
        <path d="M8 22.5h16M8 26.5h16" stroke="var(--bg)" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="16" cy="12" r="6.5" fill="var(--bg)" />
        <text x="16" y="15.6" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="var(--green)">
          $
        </text>
      </svg>
      <span className="logo-text">
        Reward<span>Rail</span>
      </span>
    </span>
  );
}
