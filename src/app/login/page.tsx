import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getMode } from "@/server/mode";
import { auth, signIn } from "@/server/auth";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  // Nothing to log into in a demo deployment: there's no session to have.
  if (getMode() === "demo") {
    redirect("/board");
  }

  const session = await auth();
  if (session?.user) {
    redirect("/board");
  }

  const { error } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Job Tracker</h1>
      {error && (
        <p className="text-sm text-destructive">
          That Google account isn&apos;t allowed to sign in here.
        </p>
      )}
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/board" });
        }}
      >
        <Button type="submit">Sign in with Google</Button>
      </form>
    </div>
  );
}
