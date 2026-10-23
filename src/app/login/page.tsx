import { redirect } from "next/navigation";
import { GitCompareArrowsIcon, InboxIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { env } from "@/server/env";
import { auth, signIn } from "@/server/auth";

const FEATURES = [
  { Icon: GitCompareArrowsIcon, text: "See how your resume matches each listing" },
  { Icon: SparklesIcon, text: "Tailor it honestly, from what you've actually done" },
  { Icon: InboxIcon, text: "Let your inbox move the board, with your OK" },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Nothing to log into in a demo deployment: there's no session to have.
  if (env.DEMO_MODE) {
    redirect("/board");
  }

  const session = await auth();
  if (session?.user) {
    redirect("/board");
  }

  const { error } = await searchParams;

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
      {/* A soft glow behind the card, for a little warmth. Decorative. */}
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-indigo-500/15 blur-3xl" />
      <ThemeToggle className="absolute top-4 right-4" />

      <div className="relative w-full max-w-sm space-y-6 rounded-2xl bg-card p-8 shadow-lg ring-1 ring-foreground/5">
        <Logo />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Your job search, in one place.</p>
        </div>
        <ul className="space-y-2.5">
          {FEATURES.map(({ Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-4" />
              </span>
              <span className="pt-1">{text}</span>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            That Google account isn&apos;t allowed to sign in here.
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/board" });
          }}
        >
          <Button type="submit" size="lg" className="w-full">
            Sign in with Google
          </Button>
        </form>
      </div>
    </div>
  );
}
