// Row types for the profile, inferred from the Drizzle tables. Type-only
// import: schema.ts is plain table metadata, safe to reference from lib/.
import type {
  profileBullets,
  profileEntries,
  profileHighlights,
  profileSkills,
} from "@/server/db/schema";

export type ProfileSkill = typeof profileSkills.$inferSelect;
export type ProfileEntryRow = typeof profileEntries.$inferSelect;
export type ProfileBullet = typeof profileBullets.$inferSelect;
export type ProfileHighlight = typeof profileHighlights.$inferSelect;

export type ProfileEntry = ProfileEntryRow & { bullets: ProfileBullet[] };

// The whole profile, as loaded by server/db/profile.ts, in display order.
export type Profile = {
  skills: ProfileSkill[];
  entries: ProfileEntry[];
  highlights: ProfileHighlight[];
};
