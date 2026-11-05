/** «Витрина»: полка с тремя приложениями — знак каталога, а не кнопка Play. */
export default function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="12" fill="#ffe000" />
      <rect x="10" y="46" width="44" height="5" rx="2.5" fill="#141414" />
      <rect x="13.5" y="24" width="10.5" height="22" rx="2.5" fill="#141414" />
      <rect x="26.75" y="16" width="10.5" height="30" rx="2.5" fill="#ff3a44" />
      <rect x="40" y="21" width="10.5" height="25" rx="2.5" fill="#00d2ff" />
      <circle cx="18.75" cy="29.5" r="1.7" fill="#ffe000" />
      <circle cx="32" cy="21.5" r="1.7" fill="#ffe000" />
      <circle cx="45.25" cy="26.5" r="1.7" fill="#141414" />
    </svg>
  );
}
