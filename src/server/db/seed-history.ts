// No "server-only" here, like seed.ts: the seed runs under tsx. Fictional
// data only: made-up companies, and comparisons written for the demo, not
// produced by a model.
import type { Status } from "@/lib/schemas/status";

// Older applications for the demo's Insights page (docs/insights.md, Step
// 5d): enough compared applications with outcomes for its numbers to mean
// something. They're shaped to show each part of the page:
// - Kubernetes is asked for by many rejected applications and only one
//   that progressed: shown, but "too few to compare".
// - AWS is missing on both sides alike: no difference to see.
// - PostgreSQL (the resume has "some SQL") is matched in some comparisons
//   and missing in others, more often missing among rejections, with 5+
//   on each side: comparable.
// - Python is in the profile but not on the resume: "in your profile".
// - Docker is marked Learning in the profile.
// - Five rejections are known to have passed screening, so the screening
//   split shows; none of their listings asked for Kubernetes.
// - Three applications have no listing, so they're listed as left out.
//
// Rules the rest of the demo depends on:
// - No company name appears in the demo inbox, so sync links nothing here.
// - No application is waiting (Applied/Acknowledged) without recent
//   activity, and Interviewing ones changed recently, so the ghosted rule
//   still only fires for Larkspur Systems.

export type HistoryApplication = {
  company: string;
  title: string;
  status: Exclude<Status, "applied" | "acknowledged">;
  appliedDaysAgo: number;
  // For Interviewing: when it last changed (recent, so it isn't "ghosted").
  updatedDaysAgo?: number;
  passedScreening?: boolean;
  // The comparison's skills. Null: no listing, so no comparison either.
  skills: { matched: string[]; missing: string[] } | null;
};

const s = (matched: string[], missing: string[]) => ({ matched, missing });

export const SEED_HISTORY: HistoryApplication[] = [
  // ---- Rejected ----
  { company: "Brindle Systems", title: "Frontend Engineer", status: "rejected", appliedDaysAgo: 150, skills: s(["React", "TypeScript"], ["Kubernetes", "AWS", "PostgreSQL"]) },
  { company: "Cinder Analytics", title: "Software Engineer", status: "rejected", appliedDaysAgo: 140, skills: s(["React", "TypeScript", "PostgreSQL"], ["Kubernetes", "Docker"]) },
  { company: "Maplestone Bank", title: "Full-Stack Developer", status: "rejected", appliedDaysAgo: 132, passedScreening: true, skills: s(["React", "Node.js", "PostgreSQL"], ["AWS", "Python"]) },
  { company: "Ostrander Logistics", title: "Frontend Developer", status: "rejected", appliedDaysAgo: 125, skills: s(["React", "Next.js"], ["Kubernetes", "Docker", "GraphQL"]) },
  { company: "Kestrel Mobility", title: "UI Engineer", status: "rejected", appliedDaysAgo: 118, passedScreening: true, skills: s(["React", "TypeScript", "Accessibility"], ["GraphQL"]) },
  { company: "Ferrous Cloud", title: "Platform Engineer", status: "rejected", appliedDaysAgo: 110, skills: s(["TypeScript"], ["Kubernetes", "AWS", "Docker", "PostgreSQL"]) },
  { company: "Lumen Ledger", title: "Frontend Engineer", status: "rejected", appliedDaysAgo: 104, passedScreening: true, skills: s(["React", "TypeScript", "Next.js"], ["Python", "PostgreSQL"]) },
  { company: "Tessellate Labs", title: "Software Engineer", status: "rejected", appliedDaysAgo: 96, skills: s(["React", "TypeScript"], ["Kubernetes", "Python", "AWS"]) },
  { company: "Bluewater Retail", title: "Web Developer", status: "rejected", appliedDaysAgo: 88, passedScreening: true, skills: s(["React", "Next.js", "Accessibility", "PostgreSQL"], ["AWS"]) },
  { company: "Harrow Security", title: "Frontend Engineer", status: "rejected", appliedDaysAgo: 80, skills: s(["React"], ["Kubernetes", "Docker", "PostgreSQL"]) },
  { company: "Sable Robotics", title: "Full-Stack Engineer", status: "rejected", appliedDaysAgo: 72, passedScreening: true, skills: s(["React", "TypeScript"], ["Python", "GraphQL", "AWS"]) },

  // ---- Ghosted ----
  { company: "Wren Payments", title: "Frontend Engineer", status: "ghosted", appliedDaysAgo: 95, skills: s(["React", "TypeScript"], ["Kubernetes", "AWS"]) },
  { company: "Ember Health", title: "React Developer", status: "ghosted", appliedDaysAgo: 84, skills: s(["React"], ["Kubernetes", "Docker", "PostgreSQL"]) },
  { company: "Corbel Studios", title: "Web Engineer", status: "ghosted", appliedDaysAgo: 70, skills: s(["React", "Next.js", "Accessibility"], ["Kubernetes"]) },

  // ---- Progressed ----
  { company: "Halyard Health", title: "Frontend Engineer", status: "offer", appliedDaysAgo: 90, skills: s(["React", "TypeScript", "Next.js", "PostgreSQL"], ["AWS", "Python"]) },
  { company: "Quarry Labs", title: "Senior Frontend Engineer", status: "offer", appliedDaysAgo: 75, skills: s(["React", "TypeScript", "Accessibility", "PostgreSQL"], ["GraphQL", "AWS"]) },
  { company: "Tamarind Software", title: "UI Engineer", status: "offer", appliedDaysAgo: 62, skills: s(["React", "TypeScript", "Accessibility"], ["Python"]) },
  { company: "Gilded Path", title: "Frontend Engineer", status: "interviewing", appliedDaysAgo: 55, updatedDaysAgo: 9, skills: s(["React", "Next.js", "PostgreSQL"], ["AWS", "Docker"]) },
  { company: "Rookery Games", title: "Web Developer", status: "interviewing", appliedDaysAgo: 48, updatedDaysAgo: 6, skills: s(["React", "TypeScript", "PostgreSQL"], ["Kubernetes", "AWS"]) },
  { company: "Osprey Travel", title: "Full-Stack Developer", status: "interviewing", appliedDaysAgo: 46, updatedDaysAgo: 12, skills: s(["React", "Node.js"], ["PostgreSQL", "Python", "AWS"]) },
  { company: "Linden Education", title: "Frontend Engineer", status: "interviewing", appliedDaysAgo: 40, updatedDaysAgo: 4, skills: s(["React", "TypeScript", "Accessibility", "PostgreSQL"], ["GraphQL"]) },

  // ---- No listing (added from an email, say): left out of insights ----
  { company: "Verdant Energy", title: "Software Engineer", status: "rejected", appliedDaysAgo: 100, skills: null },
  { company: "Northgate Insurance", title: "Frontend Developer", status: "rejected", appliedDaysAgo: 65, skills: null },
  { company: "Palisade Media", title: "Web Developer", status: "interviewing", appliedDaysAgo: 50, updatedDaysAgo: 8, skills: null },
];

// A short fake listing naming the skills its comparison is about, so the
// listing exists (and its fingerprint matches the comparison).
export function historyListing(app: HistoryApplication): string | null {
  if (!app.skills) return null;
  const skills = [...app.skills.matched, ...app.skills.missing];
  return `${app.title} at ${app.company} (demo listing). We're looking for experience with ${skills.join(", ")}.`;
}
