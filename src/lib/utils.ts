import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * "$2,607.15" — QA L28: billing amounts were rendered with raw
 * `.toFixed(2)` (no thousands separator), unlike spehr's correctly
 * formatted "$2,607.15" for the same figure. `Intl.NumberFormat`'s
 * `currency` style gives both the separator and the right currency symbol
 * for free. Falls back to a plain grouped number (with the currency code
 * prefixed) for a currency code `Intl` doesn't recognize, rather than
 * throwing.
 */
export function formatCurrency(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}
