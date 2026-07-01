"use client";

import ReactDatePicker from "react-datepicker";
import { forwardRef } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import "react-datepicker/dist/react-datepicker.css";
import "./DatePicker.css";

/**
 * Portal time picker — a themed react-datepicker in time-only mode that keeps
 * the exact same string API our native <input type="time"> fields used, so
 * swapping one in is a drop-in change. Replaces the browser's unstyleable
 * native time popup with one that matches the portal theme.
 *
 * `value`/`onChange` are HH:mm strings (24-hour, or "" for empty), never Date
 * objects. We anchor the Date to an arbitrary fixed day and only ever read/set
 * the hours+minutes, so no timezone/date drift is possible.
 */
function parse(value: string): Date | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date(2000, 0, 1);
  d.setHours(h, m, 0, 0);
  return d;
}

function format(date: Date | null): string {
  if (!date) return "";
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Minutes between options in the list. Defaults to 15. */
  step?: number;
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
      <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
    </div>
  );
});

export function TimePicker({
  value,
  onChange,
  step = 15,
  disabled,
  required,
  placeholder = "Select time",
  className,
  id,
  name,
  ...rest
}: TimePickerProps) {
  return (
    <ReactDatePicker
      selected={parse(value)}
      onChange={(date) => onChange(format(date))}
      showTimeSelect
      showTimeSelectOnly
      timeIntervals={step}
      timeCaption="Time"
      dateFormat="h:mm aa"
      disabled={disabled}
      required={required}
      placeholderText={placeholder}
      showPopperArrow={false}
      popperClassName="portal-datepicker-popper"
      calendarClassName="portal-datepicker portal-timepicker"
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
