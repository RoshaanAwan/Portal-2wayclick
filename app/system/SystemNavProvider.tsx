"use client";

import { createContext, useContext, useState } from "react";

const Ctx = createContext<{ open: boolean; openNav: () => void; closeNav: () => void }>({
  open: false,
  openNav: () => {},
  closeNav: () => {},
});

export function SystemNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Ctx.Provider value={{ open, openNav: () => setOpen(true), closeNav: () => setOpen(false) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSystemNav() {
  return useContext(Ctx);
}
