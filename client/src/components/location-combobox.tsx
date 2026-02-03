"use client";

import * as React from "react";
import { Check, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  LOCATIONS_AU_NZ,
  getLocationLabel,
  type LocationOption,
} from "@/lib/locations-au-nz";

export interface LocationValue {
  city: string;
  state: string;
  country: string;
}

function filterLocations(query: string): LocationOption[] {
  const q = (query || "").trim().toLowerCase();
  if (!q) return LOCATIONS_AU_NZ;
  return LOCATIONS_AU_NZ.filter(
    (opt) =>
      opt.city.toLowerCase().includes(q) ||
      opt.state.toLowerCase().includes(q) ||
      opt.country.toLowerCase().includes(q) ||
      opt.label.toLowerCase().includes(q)
  );
}

interface LocationComboboxProps {
  value: LocationValue | null;
  onChange: (value: LocationValue | null) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "data-testid"?: string;
}

export function LocationCombobox({
  value,
  onChange,
  placeholder = "Type city or region...",
  className,
  id,
  "data-testid": dataTestId,
}: LocationComboboxProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const displayText = value
    ? getLocationLabel(value.city, value.state, value.country)
    : inputValue;

  const searchText = value ? "" : inputValue;
  const options = React.useMemo(
    () => filterLocations(searchText),
    [searchText]
  );

  const showList = open && options.length > 0;

  // Sync input when value is set externally (e.g. from project load)
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
    // Delay so click on an option registers
    setTimeout(() => setOpen(false), 150);
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
    <div className={cn("relative", className)}>
      <div className="relative">
        <MapPin className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          id={id}
          data-testid={dataTestId}
          type="text"
          value={displayText}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            "h-14 pl-12 pr-10 text-base font-medium rounded-2xl border-border/60 bg-background/50 focus-visible:ring-primary/20 focus-visible:border-primary transition-all"
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
          className="absolute z-50 mt-1 w-full max-h-[280px] overflow-auto rounded-2xl border border-border/60 bg-popover text-popover-foreground shadow-md py-1"
          role="listbox"
        >
          {options.slice(0, 50).map((option, i) => {
            const isSelected =
              value?.city === option.city &&
              value?.state === option.state &&
              value?.country === option.country;
            const isHighlighted = i === highlightIndex;
            return (
              <li
                key={option.label}
                role="option"
                aria-selected={isSelected}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                  isHighlighted && "bg-accent text-accent-foreground",
                  !isHighlighted && "hover:bg-muted/80"
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
                    isSelected ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="truncate">{option.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
