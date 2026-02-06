"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface JobTitleInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "data-testid"?: string;
  disabled?: boolean;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);
  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export function JobTitleInput({
  value,
  onChange,
  placeholder = "e.g. Senior Frontend Engineer",
  className,
  id,
  "data-testid": dataTestId,
  disabled = false,
}: JobTitleInputProps) {
  const [open, setOpen] = React.useState(false);
  const [highlightIndex, setHighlightIndex] = React.useState(0);
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  
  const debouncedValue = useDebounce(value, 150);
  
  // Get the autocomplete suggestion (first match that starts with input)
  const autocompleteSuggestion = React.useMemo(() => {
    if (!value || value.length < 2 || suggestions.length === 0) return "";
    const match = suggestions.find(s => 
      s.toLowerCase().startsWith(value.toLowerCase())
    );
    return match || "";
  }, [value, suggestions]);

  // Track whether the user has interacted with the input (click/focus or typing)
  const userInteracted = React.useRef(false);

  // Fetch suggestions from API when value changes
  React.useEffect(() => {
    const fetchSuggestions = async () => {
      if (!debouncedValue || debouncedValue.length < 2) {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      try {
        const response = await fetch(`/api/job-titles/search?q=${encodeURIComponent(debouncedValue)}&limit=10`);
        if (response.ok) {
          const data = await response.json();
          console.log("[JobTitleInput] API response:", data);
          const titles = data.titles || [];
          setSuggestions(titles);
          setHighlightIndex(0);
          // Only open dropdown if user has actively interacted (clicked/focused/typed)
          if (titles.length > 0 && userInteracted.current) {
            setOpen(true);
          }
        }
      } catch (error) {
        console.error("Failed to fetch job title suggestions:", error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSuggestions();
  }, [debouncedValue]);

  // Show dropdown when typing and we have results or loading
  const showList = open && (suggestions.length > 0 || (isLoading && value.length >= 2));

  const handleFocus = () => {
    userInteracted.current = true;
    setOpen(true);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false);
      userInteracted.current = false;
    }, 200);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    userInteracted.current = true;
    onChange(e.target.value);
    setOpen(true);
  };

  const handleSelect = (title: string) => {
    onChange(title);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Tab or Right Arrow to accept autocomplete suggestion
    if ((e.key === "Tab" || e.key === "ArrowRight") && autocompleteSuggestion && value.length > 0) {
      const cursorAtEnd = inputRef.current?.selectionStart === value.length;
      if (cursorAtEnd && autocompleteSuggestion.toLowerCase() !== value.toLowerCase()) {
        e.preventDefault();
        handleSelect(autocompleteSuggestion);
        return;
      }
    }
    
    if (!showList) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      if (suggestions[highlightIndex]) {
        e.preventDefault();
        handleSelect(suggestions[highlightIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Ghost text - shows the remainder of the autocomplete suggestion
  const ghostText = React.useMemo(() => {
    if (!autocompleteSuggestion || !value) return "";
    if (autocompleteSuggestion.toLowerCase().startsWith(value.toLowerCase())) {
      return autocompleteSuggestion.slice(value.length);
    }
    return "";
  }, [autocompleteSuggestion, value]);

  return (
    <div className="relative" style={{ zIndex: showList ? 9999 : 'auto' }}>
      {/* Input wrapper with ghost text overlay */}
      <div className="relative">
        {/* Ghost text layer - shows autocomplete preview */}
        {ghostText && (
          <div 
            className="absolute inset-0 flex items-center pointer-events-none overflow-hidden"
            aria-hidden="true"
          >
            <span 
              className="text-transparent whitespace-pre"
              style={{ 
                padding: '0 12px',
                fontSize: '14px',
                lineHeight: '1.5',
              }}
            >
              {value}
            </span>
            <span 
              className="text-gray-400 dark:text-gray-500 whitespace-pre"
              style={{ 
                fontSize: '14px',
                lineHeight: '1.5',
              }}
            >
              {ghostText}
            </span>
          </div>
        )}
        
        <Input
          ref={inputRef}
          id={id}
          data-testid={dataTestId}
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={disabled ? undefined : handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          className={cn(className, "bg-transparent", disabled && "cursor-not-allowed opacity-70")}
          style={{ background: 'transparent' }}
        />
      </div>
      
      {/* Hint text for Tab to complete */}
      {ghostText && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
          Tab ↹
        </div>
      )}

      {showList && (
        <ul
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-1 z-[9999] max-h-[240px] overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-xl py-1"
          role="listbox"
        >
          {isLoading ? (
            <li className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </li>
          ) : suggestions.length === 0 && value.trim() ? (
            <li
              role="option"
              className="flex cursor-pointer items-center px-4 py-2.5 text-sm font-medium transition-colors bg-primary/5 hover:bg-primary/10 text-primary border-b border-primary/10"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(value.trim());
              }}
            >
              <span className="mr-2">✓</span>
              Use "{value.trim()}"
            </li>
          ) : suggestions.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-500 text-center">
              Start typing to search...
            </li>
          ) : (
            <>
              {/* Show custom value option if it doesn't exactly match any suggestion */}
              {value.trim() && !suggestions.some(s => s.toLowerCase() === value.trim().toLowerCase()) && (
                <li
                  role="option"
                  className="flex cursor-pointer items-center px-4 py-2.5 text-sm font-medium transition-colors bg-primary/5 hover:bg-primary/10 text-primary border-b border-gray-200 dark:border-gray-700"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(value.trim());
                  }}
                >
                  <span className="mr-2">✓</span>
                  Use "{value.trim()}"
                </li>
              )}
              {suggestions.map((title, i) => {
                const isHighlighted = i === highlightIndex;
                return (
                  <li
                    key={title}
                    role="option"
                    aria-selected={isHighlighted}
                    className={cn(
                      "flex cursor-pointer items-center px-4 py-2.5 text-sm font-medium transition-colors",
                      isHighlighted && "bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100",
                      !isHighlighted && "hover:bg-gray-100 dark:hover:bg-gray-800"
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(title);
                    }}
                    onMouseEnter={() => setHighlightIndex(i)}
                  >
                    {title}
                  </li>
                );
              })}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
