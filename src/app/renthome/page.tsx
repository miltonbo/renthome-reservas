import { RentHomeSite } from "@/components/renthome-site";

export const metadata = {
  title: "RentHome Departamentos · Santa Cruz de la Sierra",
  description: "Departamentos amoblados para estadías cortas en Santa Cruz de la Sierra.",
};

export default async function RentHomePage({ searchParams }: {
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}) {
  return <RentHomeSite initialDates={await searchParams} />;
}
