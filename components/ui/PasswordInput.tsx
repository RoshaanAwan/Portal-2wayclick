"use client";

import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState } from "react";

interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Extra padding on the left, e.g. when a leading icon sits inside the field. */
  leadingIcon?: React.ReactNode;
}

/**
 * Password field with a built-in show/hide eye toggle. Drop-in replacement for
 * a raw `<input type="password" className="input" />`.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, leadingIcon, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        {leadingIcon}
        <input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("input pr-10", leadingIcon && "pl-10", className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 transition-colors hover:text-ink-500"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
