"use client";

import { createContext, useContext, type ReactNode } from "react";

export type LinkOption = { value: string; label: string };
type LinkChoices = { applications: LinkOption[]; savedJobs: LinkOption[] };

const LinkChoicesContext = createContext<LinkChoices>({ applications: [], savedJobs: [] });

// Every application and saved job you could link an email to, given to
// the page once and shared by every card's picker. Passing the list to
// each card instead sent it once per card: with 150 suggestions and 340
// jobs, that alone was megabytes. See docs/performance.md.
export function LinkChoicesProvider({ applications, savedJobs, children }: LinkChoices & { children: ReactNode }) {
  return <LinkChoicesContext.Provider value={{ applications, savedJobs }}>{children}</LinkChoicesContext.Provider>;
}

export function useLinkChoices(): LinkChoices {
  return useContext(LinkChoicesContext);
}
