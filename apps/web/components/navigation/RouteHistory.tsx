"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  INTERNAL_NAVIGATION_KEY,
  isSameOriginReferrer,
} from "@/lib/navigation-history";

export function RouteHistory() {
  const pathname = usePathname();
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    if (previousPathname.current === null) {
      previousPathname.current = pathname;
      const enteredFromPraxis = isSameOriginReferrer(
        document.referrer,
        window.location.origin,
      );
      window.sessionStorage.setItem(
        INTERNAL_NAVIGATION_KEY,
        enteredFromPraxis ? "1" : "0",
      );
      return;
    }

    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      window.sessionStorage.setItem(INTERNAL_NAVIGATION_KEY, "1");
    }
  }, [pathname]);

  return null;
}
