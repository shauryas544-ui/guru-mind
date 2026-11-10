import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type * as React from "react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import { LEARN_LANGUAGES } from "@/lib/language";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ mode: z.enum(["login", "signup"]).optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Guru Mind" },
      { name: "description", content: "Log in or create your Guru Mind account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(search.mode ?? "login");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [f, setF] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    language: "English",
    level: "Beginner",
    consent: false,
  });

  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    if (!supabaseReady) return;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (data.user) navigate({ to: "/dashboard", replace: true });
      })
      .catch(() => undefined);
  }, [navigate, supabaseReady]);

  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup") {
      if (f.name.trim().length < 2) {
        toast.error("Please enter your full name.");
        return;
      }
      if (f.password.length < 8) {
        toast.error("Password should be at least 8 characters.");
        return;
      }
      if (f.password !== f.confirm) {
        toast.error("Passwords don't match.");
        return;
      }
      if (!f.consent) {
        toast.error("Please accept the privacy terms to continue.");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: f.email,
          password: f.password,
        });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: f.email,
          password: f.password,
          options: {
            emailRedirectTo: window.location.origin + "/dashboard",
            data: { full_name: f.name.trim(), learning_language: f.language, level: f.level },
          },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard" });
        else setSent("We've sent a confirmation link to your email. Click it to start learning.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(f.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("If an account exists for this email, a reset link is on its way.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/dashboard" },
      });
      if (error) toast.error(error.message || "Google sign-in didn't work. Please try again.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in didn't work.");
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand p-12 lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="text-primary-foreground">
          <Logo />
        </Link>
        <div className="text-primary-foreground">
          <p className="font-display text-4xl font-semibold leading-tight">
            "A good teacher remembers what you got wrong — and helps you get it right."
          </p>
          <p className="mt-4 opacity-80">Your Learning. Your Mind. Your Growth.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="lg:hidden">
            <Logo />
          </Link>
          {sent ? (
            <div className="mt-10">
              <h1 className="font-display text-3xl font-semibold">Check your email</h1>
              <p className="mt-3 text-muted-foreground">{sent}</p>
              <Button
                variant="outline"
                className="mt-6"
                onClick={() => {
                  setSent(null);
                  setMode("login");
                }}
              >
                Back to log in
              </Button>
            </div>
          ) : (
            <>
              <h1 className="mt-10 font-display text-3xl font-semibold lg:mt-0">
                {mode === "login"
                  ? "Welcome back"
                  : mode === "signup"
                    ? "Create your account"
                    : "Reset password"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "login"
                  ? "Continue your learning journey."
                  : mode === "signup"
                    ? "Start learning with your personal tutor."
                    : "We'll email you a reset link."}
              </p>

              {!supabaseReady && (
                <div className="mt-4 rounded-xl border border-warning/40 bg-warning-soft p-3.5 text-xs text-foreground">
                  <p className="font-semibold">Environment setup required</p>
                  <p className="mt-1 text-muted-foreground">
                    Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in
                    the root <code>.env</code> file and restart the dev server to sign in.
                  </p>
                </div>
              )}

              {mode !== "forgot" && (
                <>
                  <Button type="button" variant="outline" className="mt-6 w-full" onClick={google}>
                    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M21.35 11.1H12v2.9h5.35c-.25 1.5-1.7 4.4-5.35 4.4a5.9 5.9 0 0 1 0-11.8c1.8 0 3 .77 3.7 1.43l2.5-2.4C16.6 4.1 14.5 3.2 12 3.2a8.8 8.8 0 1 0 0 17.6c5.08 0 8.45-3.57 8.45-8.6 0-.58-.06-1.02-.1-1.1Z"
                      />
                    </svg>
                    Continue with Google
                  </Button>
                  <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    or
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </>
              )}

              <form
                onSubmit={submit}
                className={mode === "forgot" ? "mt-6 space-y-4" : "space-y-4"}
              >
                {mode === "signup" && (
                  <Field label="Full name">
                    <Input
                      value={f.name}
                      onChange={(e) => set("name", e.target.value)}
                      placeholder="Alex Sharma"
                      required
                    />
                  </Field>
                )}
                <Field label="Email">
                  <Input
                    type="email"
                    value={f.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </Field>
                {mode !== "forgot" && (
                  <Field label="Password">
                    <div className="relative">
                      <Input
                        type={show ? "text" : "password"}
                        value={f.password}
                        onChange={(e) => set("password", e.target.value)}
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShow(!show)}
                        className="absolute inset-y-0 right-3 text-muted-foreground"
                        aria-label={show ? "Hide password" : "Show password"}
                      >
                        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </Field>
                )}
                {mode === "signup" && (
                  <>
                    <Field label="Confirm password">
                      <Input
                        type={show ? "text" : "password"}
                        value={f.confirm}
                        onChange={(e) => set("confirm", e.target.value)}
                        required
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Learning language">
                        <Select value={f.language} onValueChange={(v) => set("language", v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEARN_LANGUAGES.map((l) => (
                              <SelectItem key={l} value={l}>
                                {l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Current level">
                        <Select value={f.level} onValueChange={(v) => set("level", v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["Beginner", "Intermediate", "Advanced"].map((l) => (
                              <SelectItem key={l} value={l}>
                                {l}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <Checkbox
                        checked={f.consent}
                        onCheckedChange={(v) => set("consent", v === true)}
                        className="mt-0.5"
                      />
                      I agree that Guru Mind stores my learning history to personalise my lessons.
                    </label>
                  </>
                )}
                {mode === "login" && (
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 text-muted-foreground">
                      <Checkbox defaultChecked /> Remember me
                    </label>
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="font-medium text-primary"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  {mode === "login"
                    ? "Log in"
                    : mode === "signup"
                      ? "Create account"
                      : "Send reset link"}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "login" ? (
                  <>
                    New to Guru Mind?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("signup")}
                      className="font-medium text-primary"
                    >
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className="font-medium text-primary"
                    >
                      Log in
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
