"use client";

import * as React from "react";
import { Check, MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  searchLocations,
  getLocationLabel,
  type LocationOption,
} from "@/lib/locations";

export interface LocationValue {
  city: string;
  state: string;
  country: string;
}

// Debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface LocationComboboxProps {
  value: LocationValue | null;
  onChange: (value: LocationValue | null) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "data-testid"?: string;
  disabled?: boolean;
}

export function LocationCombobox({
  value,
  onChange,
  placeholder = "Type city or region...",
  className,
  id,
  "data-testid": dataTestId,
  disabled = false,
}: LocationComboboxProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const [isSearching, setIsSearching] = React.useState(false);
  const [options, setOptions] = React.useState<LocationOption[]>([]);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const displayText = value
    ? getLocationLabel(value.city, value.state, value.country)
    : inputValue;

  const searchText = value ? "" : inputValue;
  const debouncedSearch = useDebounce(searchText, 300);

  // Search locations when debounced search text changes
  React.useEffect(() => {
    setIsSearching(true);
    const timer = setTimeout(() => {
      const results = searchLocations(debouncedSearch, 50);
      setOptions(results);
      setIsSearching(false);
      setHighlightIndex(0);
    }, 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch]);

  // Show dropdown when open and we have options OR user typed 2+ chars
  const showList = open && (options.length > 0 || isSearching || inputValue.length >= 2);

  // Sync input when value is set externally
  React.useEffect(() => {
    if (value) {
      setInputValue(getLocationLabel(value.city, value.state, value.country));
    } else {
      setInputValue("");
    }
  }, [value?.city, value?.state, value?.country]);

  const handleFocus = () => {
    setOpen(true);
    if (!value) setHighlightIndex(0);
  };

  const handleBlur = () => {
    setTimeout(() => setOpen(false), 200);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setInputValue(next);
    onChange(null);
    setOpen(true);
    setHighlightIndex(0);
  };

  const handleSelect = (option: LocationOption) => {
    onChange({
      city: option.city,
      state: option.state,
      country: option.country,
    });
    setInputValue(option.label);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % options.length);
      listRef.current?.children[highlightIndex]?.scrollIntoView?.({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + options.length) % options.length);
      listRef.current?.children[highlightIndex]?.scrollIntoView?.({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (options[highlightIndex]) handleSelect(options[highlightIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(null);
    setInputValue("");
    setHighlightIndex(0);
    inputRef.current?.focus();
  };

  return (
    <div className={cn("relative", className)} style={{ zIndex: showList ? 9999 : 'auto' }}>
      <div className="relative">
        <MapPin className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          id={id}
          data-testid={dataTestId}
          type="text"
          value={displayText}
          onChange={handleChange}
          onFocus={disabled ? undefined : handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          className={cn(
            "h-14 pl-12 pr-10 text-base font-medium rounded-2xl border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all",
            disabled && "cursor-not-allowed opacity-70"
          )}
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label="Clear location"
          >
            <span className="text-lg leading-none font-bold">×</span>
          </button>
        )}
      </div>

      {showList && (
        <ul
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-2 z-[9999] max-h-[280px] overflow-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-2xl py-1"
          role="listbox"
          style={{ 
            position: 'absolute',
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
          }}
        >
          {isSearching ? (
            <li className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching locations...
            </li>
          ) : options.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500 text-center">
              No locations found. Try a different search.
            </li>
          ) : (
            options.map((option, i) => {
              const isSelected =
                value?.city === option.city &&
                value?.state === option.state &&
                value?.country === option.country;
              const isHighlighted = i === highlightIndex;
              return (
                <li
                  key={`${option.city}-${option.stateCode}-${option.countryCode}-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                    isHighlighted && "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100",
                    !isHighlighted && "hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(option);
                  }}
                  onMouseEnter={() => setHighlightIndex(i)}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isSelected ? "opacity-100 text-blue-600" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
