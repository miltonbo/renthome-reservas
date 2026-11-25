import { notFound } from "next/navigation";
import { RentHomeSite } from "@/components/renthome-site";

export default async function RentHomePropertyPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  return <RentHomeSite propertyId={id} initialDates={await searchParams} />;
}
