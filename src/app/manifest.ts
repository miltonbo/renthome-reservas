import type { MetadataRoute } from "next";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/translations";

/**
 * PWA manifest. Per-locale because the `name` / `short_name` /
 * `description` / `lang` fields surface in the OS install dialog and
 * the eventual home-screen label. A Russian visitor installing the
 * app from /ru/ should see "DeptosBO" with a Russian description,
 * and the OS tags the installed app `lang="ru"` (which influences
 * IME selection + screen-reader voice on some platforms).
 *
 * Adding a new language: extend the LOCALIZED block below. The
 * fallback path is English. `getLocale()` already resolves the URL
 * prefix → cookie → default chain, so this manifest reflects whatever
 * locale the install was initiated under.
 */

const LOCALIZED: Record<Locale, { name: string; description: string; lang: string }> = {
  en: {
    name: "DeptosBO",
    description:
      "DeptosBO property, reservation, calendar and cleaning management.",
    lang: "en",
  },
  ru: {
    name: "DeptosBO",
    description:
      "Управление объектами, бронированиями, календарями и уборкой в DeptosBO.",
    lang: "ru",
  },
  de: {
    name: "DeptosBO",
    description:
      "Immobilien-, Reservierungs-, Kalender- und Reinigungsverwaltung mit DeptosBO.",
    lang: "de",
  },
  fr: {
    name: "DeptosBO",
    description:
      "Gestion des propriétés, réservations, calendriers et ménages avec DeptosBO.",
    lang: "fr",
  },
  es: {
    name: "DeptosBO",
    description:
      "Gestión de propiedades, reservas, calendarios y limpiezas con DeptosBO.",
    lang: "es",
  },
};

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getLocale();
  const copy = LOCALIZED[locale];
  return {
    name: copy.name,
    short_name: copy.name,
    description: copy.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: "#123b4a",
    background_color: "#f6f8f9",
    lang: copy.lang,
    icons: [
      // SVG goes first so any browser that can rasterise it gets the
      // sharpest possible icon at any zoom level. PNG fallbacks for
      // stricter installers (Lighthouse audits PWA icon as PNG).
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
