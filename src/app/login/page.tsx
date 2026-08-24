"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { GoogleOneTap } from "@/components/google-one-tap";
import { MarketingHeader } from "@/components/marketing-header";
import { AuthDivider, AuthError, AuthInput, AuthLabel, AuthSubmit } from "@/components/auth-form";

// Only allow same-origin redirects (must start with "/" but not "//")
function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="editorial min-h-screen bg-[var(--bg)]" />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Surface ?error=... from a failed Google callback redirect.
  useEffect(() => {
    const errParam = searchParams.get("error");
    if (!errParam) return;
    if (errParam === "access_denied") return; // user cancelled, not a failure
    if (errParam === "account_suspended") {
      setError(t("login.failed"));
      return;
    }
    setError(t("login.googleError"));
  }, [searchParams, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("login.failed"));
        return;
      }

      router.push(next);
      router.refresh();
    } catch {
      setError(t("login.connectionError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="editorial min-h-screen flex flex-col">
      <GoogleOneTap next={next !== "/dashboard" ? next : undefined} />

      {/* ── Header ── matches the editorial header on / so the login
          surface reads as the same site (RT-25.7). Coral pill + white
          house silhouette + SMIL smoke puffs, identical to top-bar
          and home so the brand mark stays consistent across pages. */}
      <MarketingHeader softLocaleSwitch />

      {/* ── Main ── */}
      <main className="flex flex-1 items-center justify-center px-6 py-10 sm:py-14">
        <div className="w-full max-w-[360px]">
          <div className="mb-7 text-center">
            {/* Larger version of the animated house mark above the
                wordmark — RT-25.7. Same SMIL animation as the header /
                top-bar; no entry shake. h-20 keeps it prominent
                without overpowering the form below. */}
            <Image src="/brand/deptosbo-logo-principal-light.svg" alt="DeptosBO — Gestión de propiedades" width={280} height={96} className="mx-auto mb-6 h-auto w-[240px] dark:hidden" priority />
            <Image src="/brand/deptosbo-logo-principal-dark.svg" alt="DeptosBO — Gestión de propiedades" width={280} height={96} className="mx-auto mb-6 hidden h-auto w-[240px] dark:block" priority />
            <h1 className="display text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-[var(--ink)] sm:text-[32px]">
              {t("login.title")}
            </h1>
            <p className="mt-2 text-[14px] text-[var(--ink-3)]">{t("login.subtitle")}</p>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-6 sm:p-7">
            <div className="mb-4 space-y-3">
              <GoogleSignInButton
                next={next !== "/dashboard" ? next : undefined}
                label={t("login.continueWithGoogle")}
              />
              <AuthDivider label={t("login.or")} />
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <AuthLabel htmlFor="username">{t("login.email")}</AuthLabel>
                <AuthInput
                  id="username"
                  // type="text" (not "email") so existing username-only
                  // accounts created before the email-identity switch
                  // can still sign in; inputMode hints the email keyboard.
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("login.emailPlaceholder")}
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <AuthLabel htmlFor="password">{t("login.password")}</AuthLabel>
                  <Link
                    href="/reset-password"
                    className="text-[12px] text-[var(--ink-3)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
                  >
                    {t("login.forgotPassword")}
                  </Link>
                </div>
                <AuthInput
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("login.passwordPlaceholder")}
                  required
                />
              </div>

              {error && <AuthError message={error} />}

              <AuthSubmit loading={loading}>
                {loading ? t("login.signingIn") : t("login.signIn")}
              </AuthSubmit>
            </form>
          </div>

          <p className="mt-5 text-center text-[13px] text-[var(--ink-3)]">
            {t("login.noAccount")}{" "}
            <Link
              href={next !== "/dashboard" ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
              // nofollow only when the link carries ?next= — those are
              // the infinite-variant URLs we don't want crawlers queuing.
              // Plain /signup is indexable; let Google follow it freely.
              rel={next !== "/dashboard" ? "nofollow" : undefined}
              className="text-[var(--ink)] underline-offset-2 hover:underline"
            >
              {t("login.signUpLink")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
