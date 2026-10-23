import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "@/server/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Needed for self-hosted deployments (not Vercel), where Auth.js can't
  // otherwise infer that the request's Host header is trustworthy.
  trustHost: true,
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    // This is the single-user restriction: only ALLOWED_EMAIL may ever
    // get a session, regardless of what Google account signs in.
    async signIn({ user }) {
      // Both must be present: undefined === undefined would let in an
      // account with no email if ALLOWED_EMAIL were ever unset.
      return Boolean(env.ALLOWED_EMAIL && user.email && user.email === env.ALLOWED_EMAIL);
    },
  },
});
