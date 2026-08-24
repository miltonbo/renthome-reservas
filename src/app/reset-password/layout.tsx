import type { Metadata } from "next";
import { applySeoOverrides } from "@/lib/seo";
import { getLocale } from "@/lib/i18n/server";
import { localizedAlternates } from "@/lib/i18n/alternates";
import { toOgLocale } from "@/lib/i18n/locale-tags";
import type { Locale } from "@/lib/i18n/translations";

// See login/layout.tsx — title template appends "· DeptosBO" automatically.
const RESET_COPY: Record<Locale, { title: string; description: string }> = {
  en: {
    title: "Reset password",
    description: "Reset your DeptosBO account password with a code sent to your email.",
  },
  ru: {
    title: "Сброс пароля",
    description: "Сбросьте пароль аккаунта DeptosBO с помощью кода, отправленного на вашу почту.",
  },
  de: {
    title: "Passwort zurücksetzen",
    description: "Setzen Sie Ihr DeptosBO-Kontopasswort mit einem an Ihre E-Mail gesendeten Code zurück.",
  },
  fr: {
    title: "Réinitialiser le mot de passe",
    description: "Réinitialisez le mot de passe de votre compte DeptosBO avec un code envoyé par e-mail.",
  },
  es: {
    title: "Restablecer contraseña",
    description: "Restablezca la contraseña de su cuenta DeptosBO con un código enviado a su correo.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const copy = RESET_COPY[locale];
  const alts = localizedAlternates("/reset-password", locale);
  const base: Metadata = {
    title: copy.title,
    description: copy.description,
    alternates: alts,
    openGraph: {
      type: "website",
      title: copy.title,
      description: copy.description,
      url: alts.canonical,
      siteName: "DeptosBO",
      locale: toOgLocale(locale),
    },
    twitter: { card: "summary_large_image", title: copy.title, description: copy.description },
  };
  return applySeoOverrides(base, "/reset-password", locale);
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
