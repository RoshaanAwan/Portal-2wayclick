"use client";

import ReactDatePicker from "react-datepicker";
import { forwardRef } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import "react-datepicker/dist/react-datepicker.css";
import "./DatePicker.css";

/**
 * Portal date picker — a themed react-datepicker wrapper that keeps the exact
 * same string API our native <input type="date"> fields used, so swapping one
 * in is a drop-in change.
 *
 * `value`/`onChange`/`min`/`max` are all YYYY-MM-DD strings (or "" for empty),
 * never Date objects. We parse and format at the boundary using LOCAL date
 * parts only — no `new Date("2026-07-01")` (that parses as UTC midnight and can
 * shift a day depending on the viewer's zone). This mirrors how the callers
 * already treat these values.
 */
function parse(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function format(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  /** YYYY-MM-DD lower bound (inclusive). */
  min?: string;
  /** YYYY-MM-DD upper bound (inclusive). */
  max?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Extra classes for the trigger <input>; defaults to the `.input` look. */
  className?: string;
  "aria-label"?: string;
  id?: string;
  name?: string;
}

/** Trigger input so we control the icon + our own field styling. */
const Trigger = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { triggerClassName?: string }
>(function Trigger({ triggerClassName, ...props }, ref) {
  return (
    <div className="relative">
      <input
        ref={ref}
        {...props}
        readOnly
        className={cn(triggerClassName ?? "input", "cursor-pointer pr-9")}
      />
      <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
    </div>
  );
});

export function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled,
  required,
  placeholder = "Select date",
  className,
  id,
  name,
  ...rest
}: DatePickerProps) {
  return (
    <ReactDatePicker
      selected={parse(value)}
      onChange={(date) => onChange(format(date))}
      minDate={parse(min ?? "") ?? undefined}
      maxDate={parse(max ?? "") ?? undefined}
      dateFormat="MMM d, yyyy"
      disabled={disabled}
      required={required}
      placeholderText={placeholder}
      showPopperArrow={false}
      popperClassName="portal-datepicker-popper"
      calendarClassName="portal-datepicker"
      wrapperClassName="block w-full"
      customInput={
        <Trigger
          triggerClassName={className}
          id={id}
          name={name}
          aria-label={rest["aria-label"]}
        />
      }
    />
  );
}
