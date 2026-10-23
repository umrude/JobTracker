import type { NextRequest } from "next/server";
import { handlers } from "@/server/auth";
import { isPublicDemo } from "@/server/mode";

// The public demo has no sign-in and no AUTH_SECRET, so Auth.js would fail
// on every request here. Answer 404 instead: there's nothing to sign in to.
function notInDemo(handler: (request: NextRequest) => Promise<Response>) {
  return (request: NextRequest) => (isPublicDemo() ? new Response("Not found", { status: 404 }) : handler(request));
}

export const GET = notInDemo(handlers.GET);
export const POST = notInDemo(handlers.POST);
