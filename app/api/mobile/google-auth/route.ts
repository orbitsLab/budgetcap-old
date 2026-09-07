import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/jwt";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    const { idToken } = body || {};

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json(
        { error: "Google ID token (idToken) is required" },
        {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    // Verify the Google ID token using Google's tokeninfo endpoint
    const googleRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );

    if (!googleRes.ok) {
      let errData: any = {};
      try {
        errData = await googleRes.json();
      } catch {
        // ignore parse error
      }
      return NextResponse.json(
        { error: errData.error_description || "Invalid Google ID token" },
        {
          status: 401,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    const payload = await googleRes.json();

    // Verify audience matches our configured Google Client ID(s)
    const allowedClientIds = [
      process.env.GOOGLE_MOBILE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_ID,
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    ].filter(Boolean) as string[];

    if (allowedClientIds.length > 0 && !allowedClientIds.includes(payload.aud)) {
      return NextResponse.json(
        { error: "Google token audience mismatch" },
        {
          status: 401,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    if (!payload.email) {
      return NextResponse.json(
        { error: "Google account did not provide an email address" },
        {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    const email = payload.email.toLowerCase().trim();
    const name = payload.name || email.split("@")[0];
    const image = payload.picture || null;
    const googleUserId = payload.sub;

    // 1. Check if OAuth account already exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingOAuth = await (prisma as any).oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: googleUserId,
        },
      },
      include: { user: true },
    });

    let user = existingOAuth?.user ?? null;

    // 2. If no existing OAuth record, check if a User already exists with this email
    if (!user) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        user = existingUser;

        // Link Google OAuth account to existing user
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (prisma as any).oAuthAccount.upsert({
          where: {
            provider_providerAccountId: {
              provider: "google",
              providerAccountId: googleUserId,
            },
          },
          update: {
            id_token: idToken,
          },
          create: {
            userId: user.id,
            type: "oauth",
            provider: "google",
            providerAccountId: googleUserId,
            id_token: idToken,
          },
        });

        // Update user's emailVerified and image if missing
        await prisma.user.update({
          where: { id: user.id },
          data: {
            emailVerified: user.emailVerified || new Date(),
            image: user.image || image,
          },
        });
      }
    }

    // 3. If user still does not exist, create new user + oauth account + household + member
    if (!user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await prisma.$transaction(async (tx: any) => {
        const newUser = await tx.user.create({
          data: {
            email,
            name,
            image,
            emailVerified: new Date(),
          },
        });

        await tx.oAuthAccount.create({
          data: {
            userId: newUser.id,
            type: "oauth",
            provider: "google",
            providerAccountId: googleUserId,
            id_token: idToken,
          },
        });

        const household = await tx.household.create({
          data: {
            name: `${name}'s Household`,
            ownerId: newUser.id,
          },
        });

        await tx.householdMember.create({
          data: {
            householdId: household.id,
            userId: newUser.id,
            role: "OWNER",
          },
        });

        return { user: newUser, householdId: household.id };
      });

      user = result.user;
    }

    // Ensure user has an associated household
    let member = await prisma.householdMember.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: "asc" },
    });

    if (!member) {
      const household = await prisma.household.create({
        data: {
          name: `${user.name || "My"}'s Household`,
          ownerId: user.id,
        },
      });
      member = await prisma.householdMember.create({
        data: {
          householdId: household.id,
          userId: user.id,
          role: "OWNER",
        },
      });
    }

    // Generate signed JWT session token
    const token = signToken({ userId: user.id, email: user.email });

    return NextResponse.json(
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
        householdId: member.householdId,
      },
      {
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (error: any) {
    console.error("Error in mobile Google auth:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
}
