"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/server/env";
import { DEMO_MODE_COOKIE, resolveMode } from "@/server/mode";

// Flips the local "writable demo preview" cookie (see mode.ts). No-op on a
// public demo deployment, where the cookie is ignored anyway.
export async function toggleDemoModeAction() {
  if (env.DEMO_MODE) return;

  const cookieStore = await cookies();
  const current = resolveMode(
    env.DEMO_MODE,
    cookieStore.get(DEMO_MODE_COOKIE)?.value,
  );

  if (current === "demo") {
    cookieStore.delete(DEMO_MODE_COOKIE);
  } else {
    cookieStore.set(DEMO_MODE_COOKIE, "true", { path: "/" });
  }

  redirect("/board");
}
