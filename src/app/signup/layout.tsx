import type { Metadata } from "next";
import { applySeoOverrides } from "@/lib/seo";
import { getLocale } from "@/lib/i18n/server";
import { localizedAlternates } from "@/lib/i18n/alternates";
import { toOgLocale } from "@/lib/i18n/locale-tags";
import type { Locale } from "@/lib/i18n/translations";

// "RentHome Departamentos" is appended automatically by the root layout's title template
// (`%s · RentHome Departamentos`) — keeping the brand off the per-page title avoids the
// duplicated "Sign up — RentHome Departamentos · RentHome Departamentos" we shipped briefly.
const SIGNUP_COPY: Record<Locale, { title: string; description: string }> = {
  en: {
    title: "Sign up",
    description:
      "Create a free RentHome Departamentos account. Sync Airbnb + Booking.com calendars, automate cleaning, manage multiple properties from one dashboard.",
  },
  ru: {
    title: "Регистрация",
    description:
      "Создайте бесплатный аккаунт RentHome Departamentos. Синхронизация Airbnb и Booking.com, автоматизация уборок, несколько объектов в одной панели.",
  },
  de: {
    title: "Registrieren",
    description:
      "Erstellen Sie ein kostenloses RentHome Departamentos-Konto. Airbnb und Booking.com synchronisieren, Reinigung automatisieren, mehrere Unterkünfte in einem Dashboard verwalten.",
  },
  fr: {
    title: "S’inscrire",
    description:
      "Créez un compte RentHome Departamentos gratuit. Synchronisez Airbnb et Booking.com, automatisez le ménage, gérez plusieurs logements depuis un seul tableau de bord.",
  },
  es: {
    title: "Registrarse",
    description:
      "Cree una cuenta gratuita de RentHome Departamentos. Sincronice Airbnb y Booking.com, automatice las limpiezas y gestione varios alojamientos desde un único panel.",
  },
};

// /signup needs its own canonical because the root layout's default
// canonical points at "/", and an inherited canonical that mismatches
// the URL is a deindex signal — Google reads "I am the home page"
// from a non-home URL and drops the page from the index.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const copy = SIGNUP_COPY[locale];
  const alts = localizedAlternates("/signup", locale);
  const base: Metadata = {
    title: copy.title,
    description: copy.description,
    alternates: alts,
    openGraph: {
      type: "website",
      title: copy.title,
      description: copy.description,
      url: alts.canonical,
      siteName: "RentHome Departamentos",
      locale: toOgLocale(locale),
    },
    twitter: { card: "summary_large_image", title: copy.title, description: copy.description },
  };
  return applySeoOverrides(base, "/signup", locale);
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
