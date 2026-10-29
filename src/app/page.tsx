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
const CONTACT_EMAIL = "info@deptosbo.com";
const REGISTER_URL = "https://panel.deptosbo.com/registro";

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
    lowPrice: "5",
    highPrice: "15",
    offerCount: "3",
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
  { icon: "door", title: "Operación diaria", body: "Check-ins, check-outs y cambios de huésped reunidos por día y departamento." },
  { icon: "payment", title: "Control de cobros", body: "Registra lo recibido, identifica saldos pendientes y mantén cada reserva bajo control." },
  { icon: "currency", title: "Manejo multimoneda", body: "Trabaja con dólares estadounidenses como moneda predeterminada y registra operaciones en otras monedas." },
  { icon: "chart", title: "Reportes útiles", body: "Revisa ingresos, detalle de reservas y rendimiento por propiedad o período." },
  { icon: "team", title: "Trabajo en equipo", body: "Da acceso a más usuarios y centraliza la información que necesita tu operación." },
  { icon: "document", title: "Documentos para huéspedes", body: "Genera comprobantes de reserva y recibos de pago con una presentación profesional." },
];

const baseFeatures = [
  "Sincronización de calendarios",
  "Registro y control de reservas",
  "Panel de check-ins y check-outs",
  "Reporte gerencial",
  "Manejo multimoneda (USD predeterminado)",
];

const proFeatures = [
  "Control de cobros y saldos",
  "Recibo de pago",
  "Reporte detallado",
  "Gestión de limpiezas",
];

const expertFeatures = [
  "Comprobante de reserva",
  "Reporte de rendimiento",
  "Varios usuarios y gestión de equipo",
  "Registro y seguimiento de incidencias",
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
              <a href={REGISTER_URL} className="rounded-xl bg-[#11aa9b] px-7 py-3.5 text-center font-bold text-white shadow-lg shadow-teal-500/25 transition hover:-translate-y-0.5 hover:bg-[#0d9589]">
                Probar Intermedio gratis 14 días
              </a>
              <a href="#planes" className="rounded-xl border border-white/35 bg-white/10 px-7 py-3.5 text-center font-bold text-white backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/15">
                Ver planes
              </a>
            </div>
            <p className="mt-3 text-sm text-slate-300">Crea tu cuenta y empieza a organizar tus propiedades desde el panel de DeptosBO.</p>
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

      <section className="border-y border-slate-200 bg-[#f5f9fa] py-20 dark:border-white/10 dark:bg-[#0a2027] lg:py-28">
        <div className="mx-auto grid max-w-[1180px] gap-12 px-5 lg:grid-cols-[.72fr_1.28fr] lg:items-center lg:px-6">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#0f9f91]">Tu operación en un vistazo</p>
            <h2 className="mt-4 text-3xl font-black tracking-[-.03em] text-[#0b2b36] sm:text-5xl dark:text-white">Empieza el día sabiendo qué requiere atención.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">Llegadas, salidas, huéspedes alojados y limpiezas se resumen en un panel claro para que el equipo actúe sin revisar varias herramientas.</p>
            <p className="mt-6 inline-flex rounded-full bg-[#0b2b36] px-4 py-2 text-sm font-bold text-white dark:bg-[#14b8a6]">Gestión de limpiezas disponible desde el plan Intermedio</p>
          </div>
          <DashboardOverviewMock />
        </div>
      </section>

      <section id="cobros" className="py-20 lg:py-28">
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
            <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#55d7c9]">Limpiezas organizadas</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Cada salida se convierte en una tarea clara.</h2>
            <p className="mt-5 text-lg leading-8 text-slate-300">Prioriza unidades con llegada el mismo día, asigna responsables y registra incidencias sin perder el contexto de la siguiente reserva.</p>
            <ul className="mt-7 space-y-3 text-slate-200">
              {["Tareas ordenadas por fecha", "Próxima llegada siempre visible", "Asignación e incidencias en un solo lugar"].map((item) => (
                <li key={item} className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-full bg-[#14b8a6] text-xs font-black">✓</span>{item}</li>
              ))}
            </ul>
            <p className="mt-7 inline-flex rounded-full bg-[#14b8a6] px-4 py-2 text-sm font-bold text-white">Incluido desde el plan Intermedio</p>
          </div>
          <CleaningScheduleMock />
        </div>
      </section>

      <section id="planes" className="bg-[#f5f9fa] py-20 dark:bg-[#0a2027] lg:py-28">
        <div className="mx-auto max-w-[1080px] px-5 lg:px-6">
          <SectionHeading centered eyebrow="Planes simples" title="Paga por las propiedades que administras." body="Toda cuenta nueva comienza con 14 días de prueba gratuita del plan Intermedio. Después puedes elegir el nivel adecuado para tu operación." />
          <div className="mx-auto mt-6 w-fit rounded-full border border-[#14b8a6]/30 bg-[#14b8a6]/10 px-4 py-2 text-sm font-extrabold text-[#0d8f83] dark:text-[#65dfd2]">14 días de prueba gratuita del plan Intermedio</div>
          <div className="mx-auto mt-10 grid max-w-6xl gap-6 md:grid-cols-3">
            <PriceCard name="Inicial" price="5" description="Lo esencial para centralizar calendarios y el trabajo diario." features={baseFeatures} ctaHref={REGISTER_URL} />
            <PriceCard featured name="Intermedio" price="9" description="Más análisis, documentos y colaboración para una operación en crecimiento." inheritanceLabel="Todo lo del plan Inicial, más:" trialLabel="14 días de prueba gratuita" features={proFeatures} ctaHref={REGISTER_URL} />
            <PriceCard name="Experto" price="15" description="Para equipos que necesitan mayor control operativo, coordinación y análisis." inheritanceLabel="Todo lo de los planes Inicial e Intermedio, más:" features={expertFeatures} ctaHref={REGISTER_URL} />
          </div>
        </div>
      </section>

      <section id="contacto" className="mx-auto max-w-[1180px] px-5 py-20 lg:px-6 lg:py-28">
        <div className="overflow-hidden rounded-[2rem] bg-[#0b2b36] p-7 text-white shadow-2xl shadow-slate-900/10 sm:p-12 lg:grid lg:grid-cols-[1.1fr_.9fr] lg:gap-16">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.2em] text-[#62ded0]">Conversemos</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Una operación más clara empieza aquí.</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">Empieza hoy con 14 días de prueba gratuita del plan Intermedio. Si prefieres orientación, cuéntanos cómo trabajas y te ayudaremos a identificar el plan adecuado para tu portafolio.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={REGISTER_URL} className="inline-flex justify-center rounded-xl bg-[#14b8a6] px-6 py-3.5 font-bold text-white transition hover:bg-[#10a494]">Crear cuenta y probar gratis</a>
              <a href={contactHref} className="inline-flex justify-center rounded-xl border border-white/20 px-6 py-3.5 font-bold text-white transition hover:bg-white/10">Contactarnos</a>
            </div>
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
  return <div className="mx-auto w-full max-w-xl rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10 dark:border-white/10 dark:bg-[#0b2028] sm:p-7">
    <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-white/10">
      <div><p className="text-lg font-black text-[#173743] dark:text-white">Cobro de la reserva</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Estadía de 7 noches · información de demostración</p></div>
      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">Pagada</span>
    </div>
    <div className="space-y-2 py-5 text-sm">
      <PaymentLine label="Total" value="USD 315,00" />
      <PaymentLine label="Tarifa por noche" value="USD 45,00" />
      <PaymentLine label="Pagado" value="USD 315,00" />
      <div className="border-t border-slate-200 pt-2 dark:border-white/10"><PaymentLine label="Saldo" value="USD 0,00" strong /></div>
    </div>
    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/[.04]">
      <p className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">Cargos</p>
      <div className="mt-3 flex items-center justify-between gap-4 text-sm"><span className="font-semibold text-[#173743] dark:text-white">Hospedaje (7 × USD 45,00)</span><span className="font-black">USD 315,00</span></div>
    </div>
    <div className="mt-4 rounded-2xl border border-slate-200 p-4 dark:border-white/10">
      <p className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">Pago recibido</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span><strong>28 oct 2026</strong> · Tarjeta</span><strong>USD 315,00</strong></div>
      <button type="button" className="mt-3 text-sm font-bold text-[#0e9f91]">Emitir recibo →</button>
    </div>
    <button type="button" className="mt-4 w-full rounded-xl border border-[#14b8a6]/45 px-4 py-3 text-sm font-black text-[#0e9f91]">＋ Registrar otro pago</button>
  </div>;
}

function PaymentLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-4"><span className={strong ? "font-bold text-[#173743] dark:text-white" : "text-slate-600 dark:text-slate-300"}>{label}</span><span className={strong ? "font-black text-[#173743] dark:text-white" : "font-semibold"}>{value}</span></div>;
}

function PriceCard({ name, price, description, features: items, ctaHref, inheritanceLabel, trialLabel, featured = false }: { name: string; price: string; description: string; features: string[]; ctaHref: string; inheritanceLabel?: string; trialLabel?: string; featured?: boolean }) {
  return <article className={`relative flex flex-col rounded-3xl border p-7 ${featured ? "border-[#14b8a6] bg-[#0b2b36] text-white shadow-xl shadow-teal-900/15" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5"}`}>{featured && <span className="absolute right-5 top-5 rounded-full bg-[#14b8a6] px-3 py-1 text-xs font-bold text-white">Más completo</span>}<h3 className="text-xl font-black">{name}</h3><p className={`mt-2 min-h-12 text-sm leading-6 ${featured ? "text-slate-300" : "text-slate-600 dark:text-slate-300"}`}>{description}</p><div className="mt-5"><div className="flex flex-wrap items-end gap-x-2 gap-y-1"><span className={`text-4xl font-black tracking-tight ${featured ? "text-[#65dfd2]" : "text-[#0d8f83] dark:text-[#65dfd2]"}`}>US$ {price},00</span><span className={`pb-1 text-sm ${featured ? "text-slate-300" : "text-slate-500 dark:text-slate-300"}`}>por propiedad al mes</span></div></div>{trialLabel && <p className={`mt-5 w-fit rounded-full px-3 py-1 text-xs font-bold ${featured ? "bg-white/10 text-[#65dfd2]" : "bg-[#14b8a6]/10 text-[#0d8f83]"}`}>{trialLabel}</p>}{inheritanceLabel && <p className={`mt-6 text-sm font-extrabold ${featured ? "text-white" : "text-[#173743] dark:text-white"}`}>{inheritanceLabel}</p>}<ul className={`${inheritanceLabel ? "mt-3" : "mt-6"} flex-1 space-y-3`}>{items.map((item) => <li key={item} className="flex gap-3 text-sm"><span className="font-black text-[#14b8a6]">✓</span>{item}</li>)}</ul><a href={ctaHref} className={`mt-8 block rounded-xl px-5 py-3 text-center font-bold ${featured ? "bg-[#14b8a6] text-white" : "bg-[#0b2b36] text-white dark:bg-[#14b8a6]"}`}>Iniciar prueba gratuita</a></article>;
}

function ProductCalendarMock() {
  const dates = ["28", "29", "30", "31", "1", "2", "3", "4", "5", "6"];
  return <div className="relative min-w-0 max-w-full overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white p-3 text-[#173743] shadow-2xl shadow-black/20 dark:border-white/10 dark:bg-[#0b2028] dark:text-white">
    <div className="flex min-w-0 items-center justify-between gap-3 px-2 pb-3">
      <div className="min-w-0"><p className="truncate font-extrabold">Calendario maestro</p><p className="truncate text-xs text-slate-500 dark:text-slate-400">28 oct — 6 nov · todos los alojamientos</p></div>
      <div className="flex shrink-0 gap-1"><span className="rounded-lg border border-slate-200 px-2 py-1 text-[9px] font-bold dark:border-white/10">Hoy</span><span className="rounded-lg bg-[#0d4353] px-2 py-1 text-[9px] font-bold text-white">21 días</span></div>
    </div>
    <div className="max-w-full overflow-hidden rounded-xl border border-slate-200 text-[9px] dark:border-white/10">
      <div className="grid min-w-[560px] grid-cols-[92px_repeat(10,minmax(0,1fr))] bg-slate-50 dark:bg-white/5"><div className="p-2 font-bold text-slate-400">UNIDAD</div>{dates.map((date, index) => <div key={`${date}-${index}`} className={`border-l border-slate-200 py-2 text-center font-bold dark:border-white/10 ${index === 0 ? "bg-[#14b8a6]/10 text-[#0e9f91]" : "text-slate-500"}`}>{date}</div>)}</div>
      <CalendarGroup title="ALAMEDA NORTE" />
      <CalendarMockRow name="Loft 4A" bars={[{ start: 1, span: 3, color: "bg-[#2457dc]", label: "Camila" }, { start: 6, span: 3, color: "bg-[#ed3158]", label: "Airbnb" }]} />
      <CalendarMockRow name="Suite 7C" bars={[{ start: 2, span: 4, color: "bg-[#7c3aed]", label: "Familia Ríos" }, { start: 8, span: 2, color: "bg-[#0f8a7d]", label: "Leo" }]} />
      <CalendarGroup title="SKY URBAN" />
      <CalendarMockRow name="301" bars={[{ start: 1, span: 2, color: "bg-[#0f8a7d]", label: "Mara" }, { start: 4, span: 4, color: "bg-[#2457dc]", label: "Daniel" }]} />
      <CalendarMockRow name="406" bars={[{ start: 3, span: 3, color: "bg-[#ed3158]", label: "Booking" }, { start: 7, span: 3, color: "bg-[#0f8a7d]", label: "Empresa Nova" }]} />
      <CalendarMockRow name="512" bars={[{ start: 1, span: 4, color: "bg-[#2457dc]", label: "Luciana" }, { start: 6, span: 2, color: "bg-[repeating-linear-gradient(135deg,#cbd5e1_0_5px,#f8fafc_5px_10px)] text-slate-500", label: "Bloqueado" }]} />
      <CalendarGroup title="LUXE PARK" />
      <CalendarMockRow name="104" bars={[{ start: 2, span: 3, color: "bg-[#0f8a7d]", label: "Esteban" }, { start: 6, span: 4, color: "bg-[#ed3158]", label: "Grupo amigos" }]} />
      <CalendarMockRow name="205" bars={[{ start: 1, span: 2, color: "bg-[#7c3aed]", label: "Sara" }, { start: 4, span: 5, color: "bg-[#2457dc]", label: "Andrés · USD 280" }]} />
    </div>
    <p className="mt-2 text-center text-[10px] text-slate-400">Datos ficticios para demostración</p>
  </div>;
}

function CalendarGroup({ title }: { title: string }) {
  return <div className="bg-[#edf3f5] px-3 py-1.5 text-[8px] font-black tracking-[.14em] text-[#0d4353] dark:bg-[#0d4353] dark:text-white">{title}</div>;
}

function CalendarMockRow({ name, bars }: { name: string; bars: Array<{ start: number; span: number; color: string; label: string }> }) {
  return <div className="grid min-h-10 min-w-[560px] grid-cols-[92px_repeat(10,minmax(0,1fr))] border-t border-slate-200 dark:border-white/10"><div className="flex min-w-0 items-center gap-2 p-2 font-bold text-slate-700 dark:text-slate-200"><span className="size-1.5 shrink-0 rounded-full bg-slate-300" /><span className="truncate">{name}</span></div>{Array.from({ length: 10 }, (_, index) => <div key={index} className={`min-w-0 border-l border-slate-200 dark:border-white/10 ${index === 0 ? "bg-[#14b8a6]/[.06]" : ""}`} />)}{bars.map((bar) => <div key={`${bar.start}-${bar.label}`} style={{ gridColumn: `${bar.start + 1} / span ${bar.span}`, gridRow: 1 }} className={`z-10 m-1 flex min-w-0 items-center overflow-hidden rounded-full px-2 font-bold text-white shadow-sm ${bar.color}`}><span className="truncate">{bar.label}</span></div>)}</div>;
}

function DashboardOverviewMock() {
  return <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 dark:border-white/10 dark:bg-[#0b2028]">
    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10"><div><p className="text-lg font-black text-[#173743] dark:text-white">Hoy</p><p className="text-xs text-slate-500">miércoles, 28 de octubre</p></div><span className="rounded-xl bg-[#0d4353] px-3 py-2 text-xs font-bold text-white">Nueva reserva</span></div>
    <div className="grid grid-cols-4 gap-px bg-slate-200 dark:bg-white/10">{[["Llegadas","3"],["Salidas","2"],["Alojados","8"],["Limpiezas","4"]].map(([label,value]) => <div key={label} className="bg-white px-3 py-4 dark:bg-[#0b2028]"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-[#173743] dark:text-white">{value}</p></div>)}</div>
    <div className="grid gap-3 p-4 sm:grid-cols-2"><OverviewList title="Llegadas" rows={[["Valeria M.","Sky Urban 406 · Directo"],["Tomás R.","Luxe Park 205 · Airbnb"]]} /><OverviewList title="Salidas" rows={[["Bruno A.","Alameda Norte 7C"],["Marina S.","Sky Urban 301"]]} /></div>
    <div className="border-t border-slate-200 px-5 py-4 dark:border-white/10"><p className="text-xs font-black uppercase tracking-[.12em] text-slate-500">Alojados ahora</p><div className="mt-3 flex flex-wrap gap-2">{["Carolina · 104","Diego · 512","Familia Ríos · 7C"].map(item => <span key={item} className="rounded-full bg-[#14b8a6]/10 px-3 py-1.5 text-xs font-bold text-[#0e8e82]">{item}</span>)}</div></div>
  </div>;
}

function OverviewList({ title, rows }: { title: string; rows: string[][] }) {
  return <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10"><p className="text-sm font-black text-[#173743] dark:text-white">{title}</p>{rows.map(([guest, detail]) => <div key={guest} className="mt-3 border-l-2 border-[#14b8a6] pl-3"><p className="text-sm font-bold text-[#173743] dark:text-white">{guest}</p><p className="text-[11px] text-slate-500">{detail}</p></div>)}</div>;
}

function CleaningScheduleMock() {
  const tasks = [
    { date: "JUE 29 OCT", property: "Alameda Norte 7C", next: "Próxima llegada: 30 oct", assignee: "Mariela", status: "Con incidencia", tone: "rose" },
    { date: "SÁB 31 OCT", property: "Sky Urban 301", next: "Próxima llegada: 2 nov", assignee: "Carla", status: "Pendiente", tone: "amber" },
    { date: "DOM 1 NOV", property: "Luxe Park 205", next: "Próxima llegada: 1 nov · prioridad", assignee: "Sin asignar", status: "Pendiente", tone: "amber" },
  ];
  return <div className="rounded-[1.5rem] border border-white/10 bg-white/[.06] p-4 shadow-2xl sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-lg font-black">Agenda de limpieza</p><p className="text-xs text-slate-300">Una tarea por cada salida</p></div><span className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold">Hoy</span></div><div className="space-y-4">{tasks.map(task => <div key={task.property}><p className="mb-2 text-[10px] font-black tracking-[.14em] text-[#65dfd2]">{task.date}</p><div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-bold">{task.property}</p><p className="mt-1 text-xs text-slate-300">{task.next}</p>{task.tone === "rose" && <p className="mt-1 text-xs text-rose-300">Incidencia: revisar vajilla informada</p>}</div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${task.tone === "rose" ? "bg-rose-400/15 text-rose-300" : "bg-amber-400/15 text-amber-300"}`}>{task.status}</span><span className="rounded-lg border border-white/15 px-3 py-2 text-xs">{task.assignee}</span></div></div></div>)}</div></div>;
}
