import Script from "next/script";
import { env } from "@/server/env";
import { isPublicDemo } from "@/server/mode";
import { PageviewTracker } from "@/components/pageview-tracker";

// Anonymous visit counts for the public demo, with GoatCounter: no
// cookies, no personal data, just pages and referrers. Only when this
// deployment is the public demo (isPublicDemo) and GOATCOUNTER_URL is set,
// so the live app, local development, and CI never load it, and nothing
// about your own use ever leaves your machine. See "Hosted demo" in the
// README.
export function DemoAnalytics() {
  if (!isPublicDemo() || !env.GOATCOUNTER_URL) return null;
  return (
    <>
      {/* Counts the page you land on. */}
      <Script data-goatcounter={env.GOATCOUNTER_URL} src="https://gc.zgo.at/count.js" strategy="afterInteractive" />
      {/* Counts the pages you move to after that (client-side navigation). */}
      <PageviewTracker />
    </>
  );
}
