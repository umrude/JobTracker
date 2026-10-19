import "server-only";
import { getDb } from "@/server/db/client";
import { getMode } from "@/server/mode";
import {
  importProfileFromLatexInto,
  loadProfileFrom,
  type ImportResult,
} from "@/server/db/profile-store";
import type { Profile } from "@/lib/profile/types";

// The app's entry points for the profile, using the database for the
// current mode. The logic lives in profile-store.ts so the seed can share it.

export async function loadProfile(): Promise<Profile> {
  return loadProfileFrom(getDb(await getMode()));
}

export async function importProfileFromLatex(tex: string): Promise<ImportResult> {
  return importProfileFromLatexInto(getDb(await getMode()), tex);
}
