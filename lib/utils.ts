import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatINR(paise: number): string {
  if (typeof Intl.NumberFormat === "undefined") return `₹${(paise / 100).toFixed(2)}`;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
}

export function paiseToRupeeString(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function rupeesToPaise(rupees: number | string): number {
  if (typeof rupees === "string") {
    const isNegative = rupees.trim().startsWith("-");
    const cleaned = rupees.replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed)) return 0;
    return Math.round((isNegative ? -parsed : parsed) * 100);
  }
  return Math.round(rupees * 100);
}
