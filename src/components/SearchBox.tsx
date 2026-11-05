import { memo, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";

/**
 * Изолированный поиск: владеет собственным состоянием ввода,
 * наружу отдаёт дебаунсированное значение. Глобальные рендеры
 * каталога не заставляют перерендериваться само поле.
 */
export const SearchBox = memo(function SearchBox({
  placeholder = "найти приложение, игру, разработчика…",
  ariaLabel = "Поиск по каталогу",
  onCommit,
}: {
  placeholder?: string;
  ariaLabel?: string;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const commitNow = (v: string) => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    onCommit(v);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setValue(v);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onCommit(v), 250);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setValue("");
      commitNow("");
    }
    if (e.key === "Enter") {
      e.preventDefault();
      commitNow(value);
    }
  };

  return (
    <label className="search-wrap">
      <Search size={16} strokeWidth={2.2} aria-hidden="true" />
      <input
        className="search"
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      {value && (
        <button type="button" className="search-clear" onClick={() => {
          setValue("");
          commitNow("");
        }} aria-label="Очистить поиск">
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </label>
  );
});
