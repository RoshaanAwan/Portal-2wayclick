"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Shared helper for list pages that drive their filters + pagination through
 * URL search params (so the server fetches the right slice). The page reads the
 * current values from `searchParams` and passes them down as props; this hook
 * only handles *writing* the next state back to the URL.
 *
 * `current` is the page's present param state. `setParams` merges a partial
 * update and navigates. Pass `null`/`""` to drop a param. Changing any filter
 * should reset the page — callers do that by including `page: 1` in the patch.
 */
export function useListParams<T extends Record<string, string | number | null | undefined>>(
  current: T,
) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const setParams = useCallback(
    (patch: Partial<Record<keyof T, string | number | null | undefined>>) => {
      const merged = { ...current, ...patch };
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(merged)) {
        if (value === null || value === undefined || value === "") continue;
        const str = String(value);
        // Keep canonical URLs clean: omit defaults that the page treats as "no
        // filter" / "first page".
        if (key === "page" && str === "1") continue;
        if (str === "ALL" || str === "All") continue;
        params.set(key, str);
      }
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [current, pathname, router],
  );

  return { setParams, isPending };
}
