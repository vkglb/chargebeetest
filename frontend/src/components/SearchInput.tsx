interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

// Compact search box with a leading icon and a clear button. Pair with
// useDebounce so the consuming list filters only after typing settles.
export default function SearchInput({ value, onChange, placeholder }: Props) {
  return (
    <div className="search-input">
      <svg viewBox="0 0 24 24" className="search-icon" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}
