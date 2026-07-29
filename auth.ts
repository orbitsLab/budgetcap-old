import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Adapter } from "next-auth/adapters";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/**
 * Wrap the default PrismaAdapter so that it calls `prisma.oAuthAccount`
 * instead of `prisma.account`. This is necessary because this project
 * already has a financial `Account` model and the two names would collide.
 *
 * NOTE: Prisma generates the accessor as `oAuthAccount` (capital A) for
 * the model name `OAuthAccount` — using `oauthAccount` (all lowercase)
 * results in `undefined` and an AdapterError at runtime.
 */
function customPrismaAdapter(): Adapter {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    // ── OAuth account table overrides ─────────────────────────────────────
    // The base adapter looks for `prisma.account`, but this project already
    // has a financial Account model. We redirect all calls to `oAuthAccount`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getAccount: (providerAccountId: string, provider: string) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    linkAccount: (data: any) => (prisma as any).oAuthAccount.create({ data }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unlinkAccount: (partialAccount: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma as any).oAuthAccount.delete({
        where: {
          provider_providerAccountId: {
            provider: partialAccount.provider,
            providerAccountId: partialAccount.providerAccountId,
          },
        },
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getUserByAccount: async (providerAccount: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = await (prisma as any).oAuthAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: providerAccount.provider,
            providerAccountId: providerAccount.providerAccountId,
          },
        },
        include: { user: true },
      });
      return account?.user ?? null;
    },

    // ── New-user hook ──────────────────────────────────────────────────────
    // `createUser` is called AFTER the user row is committed to the DB, so
    // the FK constraint on Household.ownerId is satisfied here. The `signIn`
    // callback fires BEFORE the user is persisted, which is why the FK
    // violation happened there.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createUser: async (data: any) => {
      // Let the base adapter insert the user first.
      const user = await base.createUser!(data);

      // Auto-create a household for every brand-new OAuth user.
      const household = await prisma.household.create({
        data: {
          name: `${user.name ?? "My"}'s Household`,
          ownerId: user.id,
        },
      });
      await prisma.householdMember.create({
        data: { householdId: household.id, userId: user.id, role: "OWNER" },
      });

      return user;
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: customPrismaAdapter(),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    // Household creation now lives in the adapter's `createUser` override
    // above, which runs after the user is persisted. Returning true here
    // simply allows the sign-in to proceed for all providers.
    signIn() {
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Allow users who registered with email/password to also sign in via
      // Google using the same address. Without this, NextAuth throws
      // OAuthAccountNotLinked when the email already exists in the DB.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;

        const passwordMatch = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatch) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
        };
      },
    }),
  ],
});
