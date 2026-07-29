"use client";

import { useActionState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerUser, type RegisterState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { signIn } from "next-auth/react";

const initialState: RegisterState = {};

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-destructive mt-1">{messages[0]}</p>;
}

// Simple Google "G" icon SVG
function GoogleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v8.51h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.14z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.97 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [state, action, isPending] = useActionState(registerUser, initialState);
  const [isGooglePending, startGoogleTransition] = useTransition();

  useEffect(() => {
    if (state?.success) {
      toast.success("Account created! Please sign in.");
      router.push("/login");
    }
  }, [state, router]);

  function handleGoogleSignUp() {
    startGoogleTransition(async () => {
      await signIn("google", { callbackUrl: "/budget" });
    });
  }

  return (
    <Card className="w-full max-w-sm shadow-xl shadow-black/5 dark:shadow-black/30">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Create account</CardTitle>
        <CardDescription>Start your zero-based budgeting journey</CardDescription>
      </CardHeader>

      {/* Google OAuth button */}
      <div className="px-6 pb-2">
        <Button
          id="google-signup-btn"
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={handleGoogleSignUp}
          disabled={isGooglePending || isPending}
        >
          {isGooglePending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          Continue with Google
        </Button>
      </div>

      {/* Divider */}
      <div className="px-6 py-2 flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground font-medium">or sign up with email</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <form action={action}>
        <CardContent className="space-y-4">
          {state?.errors?._form && (
            <div
              role="alert"
              className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive"
            >
              {state.errors._form[0]}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reg-name">Full Name</Label>
            <Input
              id="reg-name"
              name="name"
              type="text"
              placeholder="Aarav Sharma"
              autoComplete="name"
              required
            />
            <FieldError messages={state?.errors?.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-email">Email</Label>
            <Input
              id="reg-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <FieldError messages={state?.errors?.email} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-password">Password</Label>
            <Input
              id="reg-password"
              name="password"
              type="password"
              placeholder="Min. 6 characters"
              autoComplete="new-password"
              required
              minLength={6}
            />
            <FieldError messages={state?.errors?.password} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-household">Household Name</Label>
            <Input
              id="reg-household"
              name="householdName"
              type="text"
              placeholder="e.g. Sharma Family Budget"
              required
            />
            <FieldError messages={state?.errors?.householdName} />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button
            id="register-submit-btn"
            type="submit"
            className="w-full"
            disabled={isPending || isGooglePending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account…
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Create Account
              </>
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-primary hover:underline"
              id="go-to-login-link"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
