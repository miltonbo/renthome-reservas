import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { applySeoOverrides } from "@/lib/seo";
import { localePath } from "@/lib/i18n/alternates";
import { GoogleOneTap } from "@/components/google-one-tap";
import { JsonLd } from "@/components/json-ld";
import { MarketingHeader } from "@/components/marketing-header";
import { getLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/translations";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const CONTACT_EMAIL = "info@technovabolivia.com";

const HOME_META: Record<Locale, { title: string; description: string }> = {
  es: {
    title: "DeptosBO — gestión profesional de alquileres temporales",
    description: "Centraliza calendarios, reservas, check-ins, limpiezas y reportes de todas tus propiedades en un solo lugar.",
  },
  en: {
    title: "DeptosBO — professional short-term rental management",
    description: "Centralize calendars, reservations, check-ins, cleaning and reports for every property in one place.",
  },
  de: {
    title: "DeptosBO — professionelle Verwaltung von Kurzzeitvermietungen",
    description: "Kalender, Reservierungen, Check-ins, Reinigung und Berichte für alle Unterkünfte an einem Ort.",
  },
  fr: {
    title: "DeptosBO — gestion professionnelle de locations courte durée",
    description: "Centralisez calendriers, réservations, arrivées, ménages et rapports pour tous vos logements.",
  },
  ru: {
    title: "DeptosBO — профессиональное управление краткосрочной арендой",
    description: "Календари, бронирования, заезды, уборки и отчёты по всем объектам в одном месте.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const { localizedAlternates, SUPPORTED_LOCALES } = await import("@/lib/i18n/alternates");
  const { toOgLocale } = await import("@/lib/i18n/locale-tags");
  const locale = await getLocale();
  const meta = HOME_META[locale];
  const alternates = localizedAlternates("/", locale);
  return applySeoOverrides<Metadata>({
    title: meta.title,
    description: meta.description,
    alternates,
    openGraph: {
      type: "website",
      title: meta.title,
      description: meta.description,
      url: alternates.canonical,
      siteName: "DeptosBO",
      locale: toOgLocale(locale),
      alternateLocale: SUPPORTED_LOCALES.filter((item) => item !== locale).map(toOgLocale),
    },
    twitter: { card: "summary_large_image", title: meta.title, description: meta.description },
  }, "/", locale);
}

const softwareData: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "DeptosBO",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description: HOME_META.es.description,
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "USD",
    lowPrice: "2",
    highPrice: "3",
    offerCount: "2",
  },
  featureList: [
    "Calendario maestro",
    "Sincronización de calendarios",
    "Registro de reservas",
    "Panel de check-ins y check-outs",
    "Coordinación de limpiezas",
    "Reportes financieros",
  ],
};

const features = [
  { icon: "calendar", title: "Calendario maestro", body: "Visualiza todas tus propiedades y reservas en una línea de tiempo clara, sin saltar entre calendarios." },
  { icon: "sync", title: "Calendarios sincronizados", body: "Conecta calendarios externos y reduce el riesgo de cruces o reservas duplicadas." },
  { icon: "door", title: "Operación diaria", body: "Check-ins, check-outs, cambios de huésped y limpiezas reunidos por día y departamento." },
  { icon: "payment", title: "Control de cobros", body: "Registra lo recibido, identifica saldos pendientes y mantén cada reserva bajo control." },
  { icon: "currency", title: "Manejo multimoneda", body: "Trabaja con dólares estadounidenses como moneda predeterminada y registra operaciones en otras monedas." },
  { icon: "chart", title: "Reportes útiles", body: "Revisa ingresos, detalle de reservas y rendimiento por propiedad o período." },
  { icon: "team", title: "Trabajo en equipo", body: "Da acceso a más usuarios y centraliza la información que necesita tu operación." },
  { icon: "document", title: "Documentos para huéspedes", body: "Genera comprobantes de reserva y recibos de pago con una presentación profesional." },
];

const baseFeatures = [
  "Sincronización de calendarios",
  "Registro y control de reservas",
  "Calendario por propiedad",
  "Panel de check-ins y check-outs",
  "Reporte gerencial",
  "Manejo multimoneda (USD predeterminado)",
];

const proFeatures = [
  ...baseFeatures,
  "Control de cobros y saldos",
  "Comprobante de reserva",
  "Recibo de pago",
  "Reporte detallado",
  "Reporte de rendimiento",
  "Gestión de más de un usuario",
];

const expertFeatures = [
  ...proFeatures,
  "Todas las funcionalidades incluidas",
  "Descuento especial por volumen",
];

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  const locale = await getLocale();
  const mailBody = encodeURIComponent(
    "Hola, quiero conocer DeptosBO.\n\nNombre de la empresa:\nPaís(es) y ciudad(es) donde operamos:\nCantidad de propiedades:\nCanales que utilizamos:\nCantidad de personas en el equipo:\nInformación adicional:",
  );
  const contactHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Quiero conocer DeptosBO")}&body=${mailBody}`;

  return (
    <main className="min-h-screen overflow-hidden bg-white text-[#102b36] dark:bg-[#07191f] dark:text-white">
      <JsonLd data={softwareData} />
      <GoogleOneTap next="/dashboard" />
      <MarketingHeader />

      <section className="relative isolate border-b border-white/10 bg-[#071b22] text-white">
        <div className="absolute inset-0 -z-20 bg-cover bg-[position:68%_center] lg:bg-center" style={{ backgroundImage: "url('/marketing/short-stay-arrival-hero.webp')" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#061b23]/95 via-[#061b23]/75 to-[#061b23]/30" />
        <div className="mx-auto grid min-w-0 max-w-[1180px] grid-cols-1 gap-14 px-5 pb-20 pt-16 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:px-6 lg:pb-28 lg:pt-24">
          <div className="min-w-0">
            <p className="mb-5 inline-block max-w-full rounded-full border border-[#65dfd2]/30 bg-[#071b22]/45 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-[#65dfd2] backdrop-blur-sm">
              Para anfitriones y gestores con más de 3 propiedades
            </p>
            <h1 className="max-w-2xl text-4xl font-black leading-[1.03] tracking-[-.045em] text-white sm:text-6xl">
              Toda tu operación de alquileres, <span className="text-[#11a99a]">en una sola vista.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-200">
              Organiza reservas, calendarios, cobros, check-ins, limpiezas y reportes sin depender de hojas dispersas ni revisar cada canal por separado.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#planes" className="rounded-xl bg-[#11aa9b] px-7 py-3.5 text-center font-bold text-white shadow-lg shadow-teal-500/25 transition hover:-translate-y-0.5 hover:bg-[#0d9589]">
                Ver planes
              </a>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <span className="mr-1 font-semibold text-white">Centraliza tu operación:</span>
              <Channel label="Airbnb" color="bg-[#ff385c]" />
              <Channel label="Booking.com" color="bg-[#1475b8]" />
              <Channel label="Vrbo" color="bg-[#6552cb]" />
              <Channel label="Directo" color="bg-[#179f7d]" />
            </div>
          </div>
          <ProductCalendarMock />
        </div>
      </section>

      <section id="funciones" className="mx-auto max-w-[1180px] px-5 py-20 lg:px-6 lg:py-28">
        <SectionHeading eyebrow="Una plataforma para operar mejor" title="Menos tareas dispersas. Más control sobre cada estadía." body="DeptosBO reúne la información importante para que tu equipo sepa qué ocurre hoy, qué viene después y cómo está funcionando el negocio." />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => <FeatureCard key={feature.title} {...feature} />)}
        </div>
      </section>

      <section id="cobros" className="border-y border-slate-200 bg-[#f5f9fa] py-20 dark:border-white/10 dark:bg-[#0a2027] lg:py-28">
        <div className="mx-auto grid max-w-[1180px] gap-12 px-5 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:px-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#0f9f91]">Control de cobros</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-.03em] text-[#0b2b36] sm:text-5xl dark:text-white">Cada pago claro. Cada saldo bajo control.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">Registra el dinero recibido por reserva, identifica quién lo cobró y detecta de inmediato cuánto falta por pagar.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {["Seguimiento de cobros por reserva", "Saldos pendientes visibles", "Registro por moneda y método", "Responsable de cada ingreso"].map((item) => <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-[#173743] dark:border-white/10 dark:bg-white/5 dark:text-white"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#14b8a6]/15 text-xs text-[#0e9f91]">✓</span>{item}</div>)}
            </div>
            <p className="mt-6 inline-flex rounded-full bg-[#0b2b36] px-4 py-2 text-sm font-bold text-white dark:bg-[#14b8a6]">Incluido desde el plan Intermedio</p>
          </div>
          <PaymentControlMock />
        </div>
      </section>

      <section id="experiencia" className="relative isolate min-h-[430px] overflow-hidden bg-[#071b22] text-white">
        <div className="absolute inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: "url('/marketing/short-stay-rooftop-pool.webp')" }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#061b23]/95 via-[#061b23]/65 to-transparent" />
        <div className="mx-auto flex min-h-[430px] max-w-[1180px] items-center px-5 py-16 lg:px-6">
          <div className="max-w-xl">
            <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#65dfd2]">Hospitalidad que crece contigo</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-.03em] sm:text-5xl">Menos tiempo ordenando datos. Más tiempo para tus huéspedes.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-200">DeptosBO convierte una operación compleja en una experiencia clara para que puedas enfocarte en hacer crecer tus rentas cortas.</p>
          </div>
        </div>
      </section>

      <section className="bg-[#082731] py-20 text-white lg:py-28">
        <div className="mx-auto grid max-w-[1180px] gap-12 px-5 lg:grid-cols-[.75fr_1.25fr] lg:items-center lg:px-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#55d7c9]">La operación del día, resuelta</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Tu equipo sabe dónde actuar.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-300">Identifica ingresos, salidas, cambios de huésped y limpiezas desde un panel consolidado y fácil de leer.</p>
            <ul className="mt-7 space-y-3 text-slate-200">
              {["Totales diarios de ingresos y limpiezas", "Cambios de huésped destacados", "Información ordenada por alojamiento"].map((item) => (
                <li key={item} className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-full bg-[#14b8a6] text-xs font-black">✓</span>{item}</li>
              ))}
            </ul>
          </div>
          <OperationsMock />
        </div>
      </section>

      <section id="planes" className="bg-[#f5f9fa] py-20 dark:bg-[#0a2027] lg:py-28">
        <div className="mx-auto max-w-[1080px] px-5 lg:px-6">
          <SectionHeading centered eyebrow="Planes simples" title="Paga por las propiedades que administras." body="Prueba cualquiera de nuestros planes durante dos semanas sin costo y elige el nivel adecuado para tu operación." />
          <div className="mx-auto mt-6 w-fit rounded-full border border-[#14b8a6]/30 bg-[#14b8a6]/10 px-4 py-2 text-sm font-extrabold text-[#0d8f83] dark:text-[#65dfd2]">14 días de prueba gratuita en cualquier plan</div>
          <div className="mx-auto mt-10 grid max-w-6xl gap-6 md:grid-cols-3">
            <PriceCard name="Inicial" price="2" description="Lo esencial para centralizar calendarios y el trabajo diario." features={baseFeatures} ctaHref={contactHref} />
            <PriceCard featured name="Intermedio" price="3" description="Más análisis, documentos y colaboración para una operación en crecimiento." features={proFeatures} ctaHref={contactHref} />
            <PriceCard name="Experto" description="Para operaciones con 20 propiedades o más, con todas las funcionalidades y condiciones preferenciales." features={expertFeatures} ctaHref={contactHref} condition="20 propiedades o más" />
          </div>
        </div>
      </section>

      <section id="contacto" className="mx-auto max-w-[1180px] px-5 py-20 lg:px-6 lg:py-28">
        <div className="overflow-hidden rounded-[2rem] bg-[#0b2b36] p-7 text-white shadow-2xl shadow-slate-900/10 sm:p-12 lg:grid lg:grid-cols-[1.1fr_.9fr] lg:gap-16">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#62ded0]">Conversemos</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Una operación más clara empieza aquí.</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">Cuéntanos cómo trabajas y te ayudaremos a identificar el plan adecuado para tu portafolio.</p>
            <a href={contactHref} className="mt-8 inline-flex rounded-xl bg-[#14b8a6] px-6 py-3.5 font-bold text-white transition hover:bg-[#10a494]">Contactarnos</a>
            <p className="mt-4 text-sm text-slate-400">O escríbenos a <a className="font-bold text-white underline decoration-[#14b8a6] underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
          </div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[.06] p-6 lg:mt-0">
            <p className="font-bold">Para responderte mejor, comparte:</p>
            <ul className="mt-5 space-y-3 text-sm text-slate-300">
              {["Nombre de tu empresa", "Países y ciudades donde operas", "Cantidad de propiedades", "Canales que utilizas", "Cantidad de personas en tu equipo", "Cualquier necesidad particular de tu operación"].map((item) => (
                <li key={item} className="flex gap-3"><span className="text-[#55d7c9]">●</span>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 px-5 py-8 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
        <div className="mx-auto flex max-w-[1180px] flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} DeptosBO. Gestión profesional de alquileres temporales.</p>
          <div className="flex gap-5"><Link href={localePath("/terms", locale)}>Términos</Link><Link href={localePath("/privacy", locale)}>Privacidad</Link><a href={`mailto:${CONTACT_EMAIL}`}>Contacto</a></div>
        </div>
      </footer>
    </main>
  );
}

function SectionHeading({ eyebrow, title, body, centered = false }: { eyebrow: string; title: string; body: string; centered?: boolean }) {
  return <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}><p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#0f9f91]">{eyebrow}</p><h2 className="mt-4 text-3xl font-black tracking-[-.03em] text-[#0b2b36] sm:text-5xl dark:text-white">{title}</h2><p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">{body}</p></div>;
}

function Channel({ label, color }: { label: string; color: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/90 px-2.5 py-1 text-slate-700 shadow-sm backdrop-blur-sm"><span className={`size-2 rounded-full ${color}`} />{label}</span>;
}

function FeatureIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M7 14h3M14 14h3M7 18h3"/></>,
    sync: <><path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M19 11a7 7 0 0 0-12-5L5 8M5 13a7 7 0 0 0 12 5l2-2"/></>,
    door: <><path d="M4 21h16M6 21V3h12v18M14 12h.01"/></>,
    payment: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M7 15h2"/></>,
    chart: <><path d="M4 19V5M4 19h16"/><path d="m7 15 4-4 3 2 5-6"/></>,
    currency: <><circle cx="12" cy="12" r="9"/><path d="M16 8.5c-.7-.9-1.8-1.5-3.2-1.5-1.8 0-3.3.9-3.3 2.4 0 3.6 6.8 1.6 6.8 5.2 0 1.5-1.5 2.4-3.5 2.4-1.5 0-2.8-.6-3.6-1.6M12.8 5v14"/></>,
    document: <><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M9 12h7M9 16h7"/></>,
    team: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-6">{paths[name]}</svg>;
}

function FeatureCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5 dark:border-white/10 dark:bg-white/[.04]"><div className="grid size-11 place-items-center rounded-xl bg-[#14b8a6]/12 text-[#0e9f91]"><FeatureIcon name={icon} /></div><h3 className="mt-5 text-lg font-extrabold text-[#0b2b36] dark:text-white">{title}</h3><p className="mt-2 leading-7 text-slate-600 dark:text-slate-300">{body}</p></article>;
}

function PaymentControlMock() {
  return <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/10 dark:border-white/10 dark:bg-[#0b2028] sm:p-6"><div className="rounded-2xl border border-[#14b8a6]/45 bg-[#14b8a6]/10 p-4"><div className="flex items-center justify-between gap-4"><p className="text-sm font-extrabold text-[#173743] dark:text-white">Cobro de esta reserva</p><span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-300">Saldado</span></div><div className="mt-4 grid grid-cols-3 gap-3"><PaymentMetric label="A cobrar" value="USD 485" /><PaymentMetric label="Pagado" value="USD 485" /><PaymentMetric label="Adeudado" value="USD 0" positive /></div><div className="mt-4 rounded-xl border border-[#14b8a6]/45 bg-white/55 px-4 py-2.5 text-center text-sm font-extrabold text-[#0e9f91] dark:bg-white/5">Tramo conciliado y pagado</div></div><div className="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-white/10"><p className="text-sm font-extrabold text-[#173743] dark:text-white">Dinero recibido</p><PaymentRow amount="USD 185" type="Hospedaje" method="Tarjeta" person="Equipo 1" /><PaymentRow amount="USD 300" type="Hospedaje" method="Tarjeta" person="Equipo 2" /></div><div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[.03]"><p className="text-sm font-extrabold text-[#173743] dark:text-white">Registrar dinero recibido</p><div className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">Hospedaje <span className="float-right">⌄</span></div><div className="mt-2 grid grid-cols-[1fr_.8fr] gap-2"><div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">Tarjeta <span className="float-right">⌄</span></div><div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-400 dark:border-white/10 dark:bg-white/5">USD &nbsp; Monto</div></div><div className="mt-2 rounded-lg bg-[#8fd8d1] px-4 py-2.5 text-center text-sm font-extrabold text-white">Registrar ingreso</div></div><p className="mt-3 text-center text-[11px] text-slate-400">Información ficticia para demostración · USD predeterminado</p></div>;
}

function PaymentMetric({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return <div><p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p><p className={`mt-1 text-sm font-black ${positive ? "text-emerald-600 dark:text-emerald-300" : "text-[#173743] dark:text-white"}`}>{value}</p></div>;
}

function PaymentRow({ amount, type, method, person }: { amount: string; type: string; method: string; person: string }) {
  return <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs dark:border-white/10"><span className="font-black text-[#173743] dark:text-white">{amount}</span><span className="rounded bg-slate-100 px-2 py-1 font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">{type}</span><span className="text-slate-400">{method}</span><span className="ml-auto text-slate-500 dark:text-slate-300">{person}</span><span className="grid size-5 place-items-center rounded-full bg-rose-100 font-bold text-rose-500">×</span></div>;
}

function PriceCard({ name, price, description, features: items, ctaHref, condition, featured = false }: { name: string; price?: string; description: string; features: string[]; ctaHref: string; condition?: string; featured?: boolean }) {
  return <article className={`relative flex flex-col rounded-3xl border p-7 ${featured ? "border-[#14b8a6] bg-[#0b2b36] text-white shadow-xl shadow-teal-900/15" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5"}`}>{featured && <span className="absolute right-5 top-5 rounded-full bg-[#14b8a6] px-3 py-1 text-xs font-bold text-white">Más completo</span>}<h3 className="text-xl font-black">{name}</h3><p className={`mt-2 min-h-12 text-sm leading-6 ${featured ? "text-slate-300" : "text-slate-600 dark:text-slate-300"}`}>{description}</p>{price ? <div className="mt-6 flex items-end gap-2"><span className="pb-1 text-sm font-bold">USD</span><span className="text-5xl font-black tracking-tight">{price}</span><span className={`pb-1 text-sm ${featured ? "text-slate-300" : "text-slate-500"}`}>por propiedad</span></div> : <div className="mt-6"><p className="text-2xl font-black text-[#0d8f83] dark:text-[#65dfd2]">Descuento especial</p><p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-300">{condition}</p></div>}<p className={`mt-5 w-fit rounded-full px-3 py-1 text-xs font-bold ${featured ? "bg-white/10 text-[#65dfd2]" : "bg-[#14b8a6]/10 text-[#0d8f83]"}`}>2 semanas de prueba gratuita</p><ul className="mt-6 flex-1 space-y-3">{items.map((item) => <li key={item} className="flex gap-3 text-sm"><span className="font-black text-[#14b8a6]">✓</span>{item}</li>)}</ul><a href={ctaHref} className={`mt-8 block rounded-xl px-5 py-3 text-center font-bold ${featured ? "bg-[#14b8a6] text-white" : "bg-[#0b2b36] text-white dark:bg-[#14b8a6]"}`}>Solicitar información</a></article>;
}

function ProductCalendarMock() {
  const dates = ["LU 14", "MA 15", "MI 16", "JU 17", "VI 18", "SÁ 19", "DO 20"];
  return <div className="relative min-w-0 max-w-full overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white p-3 shadow-2xl shadow-[#0b2b36]/15 dark:border-white/10 dark:bg-[#0b2028]"><div className="flex min-w-0 items-center justify-between gap-2 px-2 pb-3"><div className="min-w-0"><p className="truncate font-extrabold">Calendario maestro</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">Reservas confirmadas en una sola vista</p></div><span className="shrink-0 rounded-full bg-[#14b8a6]/12 px-2 py-1 text-[10px] font-bold text-[#0f9f91] sm:px-3 sm:text-xs">12 alojamientos</span></div><div className="max-w-full overflow-hidden rounded-xl border border-slate-200 text-[10px] dark:border-white/10"><div className="grid min-w-0 grid-cols-[90px_repeat(7,minmax(0,1fr))] bg-slate-50 sm:grid-cols-[115px_repeat(7,minmax(0,1fr))] dark:bg-white/5"><div className="truncate p-2 font-bold text-slate-400 sm:p-3">DEPARTAMENTO</div>{dates.map((date) => <div key={date} className="truncate border-l border-slate-200 px-0 py-2 text-center text-[8px] font-bold text-slate-500 sm:p-3 sm:text-[10px] dark:border-white/10">{date}</div>)}</div><div className="bg-[#0d4353] px-3 py-2 font-black tracking-widest text-white">SKY CENTRAL</div><CalendarRow name="Departamento 301" bars={[{ start: 1, span: 2, color: "bg-[#1d75b7]", label: "Andrea · USD 120" }, { start: 4, span: 3, color: "bg-[#ff3d63]", label: "Reserva Airbnb" }]} /><CalendarRow name="Departamento 406" bars={[{ start: 2, span: 4, color: "bg-[#16a07e]", label: "Lucas · USD 205" }]} /><CalendarRow name="Departamento 512" bars={[{ start: 1, span: 3, color: "bg-[#6552cb]", label: "Martín · USD 185" }]} /><div className="bg-[#0d4353] px-3 py-2 font-black tracking-widest text-white">LUXE TOWER</div><CalendarRow name="Departamento 104" bars={[{ start: 3, span: 3, color: "bg-[#ff3d63]", label: "Reserva Airbnb" }]} /><CalendarRow name="Departamento 205" bars={[{ start: 1, span: 4, color: "bg-[#1d75b7]", label: "Sofía · USD 210" }]} /></div><div className="pointer-events-none absolute -right-7 -top-7 -z-10 size-40 rounded-full bg-[#14b8a6]/20 blur-3xl" /></div>;
}

function CalendarRow({ name, bars }: { name: string; bars: Array<{ start: number; span: number; color: string; label: string }> }) {
  return <div className="grid min-h-12 min-w-0 grid-cols-[90px_repeat(7,minmax(0,1fr))] border-t border-slate-200 sm:grid-cols-[115px_repeat(7,minmax(0,1fr))] dark:border-white/10"><div className="flex min-w-0 items-center p-2 font-bold text-slate-700 dark:text-slate-200"><span className="truncate">{name}</span></div>{[1,2,3,4,5,6,7].map((day) => <div key={day} className="min-w-0 border-l border-slate-200 dark:border-white/10" />)}{bars.map((bar) => <div key={`${bar.start}-${bar.label}`} style={{ gridColumn: `${bar.start + 1} / span ${bar.span}`, gridRow: 1 }} className={`z-10 m-1 flex min-w-0 items-center overflow-hidden rounded-lg px-1 font-bold text-white shadow-sm sm:px-2 ${bar.color}`}><span className="truncate">{bar.label}</span></div>)}</div>;
}

function OperationsMock() {
  const rows = [
    ["Departamento 406", "INGRESO", "Valentina R.", "Limpieza"],
    ["Departamento 512", "CAMBIO DE HUÉSPED", "Carlos → Mariana", "Limpieza"],
    ["Departamento 301", "SALIDA", "Gabriel M.", "Limpieza"],
    ["Departamento 205", "INGRESO", "Lucía P.", ""],
  ];
  return <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.06] shadow-2xl"><div className="flex items-center gap-3 border-b border-[#14b8a6]/50 px-5 py-4"><p className="font-extrabold">Hoy</p><span className="rounded-full bg-cyan-500/15 px-2.5 py-1 text-xs font-bold text-cyan-300">3 ingresos</span><span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">3 limpiezas</span></div>{rows.map(([property, status, guest, cleaning]) => <div key={property} className={`grid grid-cols-[1fr_1.5fr_auto] items-center gap-3 border-b border-white/[.07] px-5 py-4 last:border-0 ${status === "CAMBIO DE HUÉSPED" ? "bg-amber-400/[.07]" : ""}`}><p className="text-sm font-bold">{property}</p><div className="flex min-w-0 items-center gap-2"><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${status === "INGRESO" ? "bg-cyan-500/15 text-cyan-300" : status === "SALIDA" ? "bg-slate-500/20 text-slate-300" : "bg-amber-500/15 text-amber-300"}`}>{status}</span><span className="truncate text-sm text-slate-300">{guest}</span></div>{cleaning && <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300">{cleaning}</span>}</div>)}</div>;
}
