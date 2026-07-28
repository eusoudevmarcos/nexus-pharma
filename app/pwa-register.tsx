"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // O status offline da UI continua operante mesmo sem o worker.
      });
    }
  }, []);

  return null;
}

