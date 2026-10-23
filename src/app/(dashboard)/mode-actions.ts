"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_MODE_COOKIE, isPublicDemo, resolveMode } from "@/server/mode";

// Flips the local "writable demo preview" cookie (see mode.ts). No-op on a
// public demo deployment, where the cookie is ignored anyway.
export async function toggleDemoModeAction() {
  if (isPublicDemo()) return;

  const cookieStore = await cookies();
  const current = resolveMode(
    isPublicDemo(),
    cookieStore.get(DEMO_MODE_COOKIE)?.value,
  );

  if (current === "demo") {
    cookieStore.delete(DEMO_MODE_COOKIE);
  } else {
    cookieStore.set(DEMO_MODE_COOKIE, "true", { path: "/" });
  }

  redirect("/board");
}
