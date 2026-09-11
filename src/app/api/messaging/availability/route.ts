import { NextRequest, NextResponse } from "next/server";
import { getMessagingAccess } from "@/lib/messaging-auth";
import {
  evaluatePropertyAvailability,
  parseAvailabilityQuery,
} from "@/lib/messaging-availability";
import { MessagingValidationError } from "@/lib/messaging";
import { listAccessiblePropertyIds } from "@/lib/ownership";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const access = await getMessagingAccess(request);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const evaluatedAt = new Date();
    const query = parseAvailabilityQuery(request.nextUrl.searchParams, evaluatedAt);
    const accessibleIds = await listAccessiblePropertyIds(access.userId, access.role);
    if (query.propertyId && !accessibleIds.includes(query.propertyId)) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const properties = await prisma.property.findMany({
      where: {
        id: query.propertyId ? query.propertyId : { in: accessibleIds },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        minNights: true,
        checkInTime: true,
        checkOutTime: true,
        bookingWindow: true,
        cleaningEnabled: true,
        isPaused: true,
        reservations: {
          where: { status: "confirmed" },
          select: { checkIn: true, checkOut: true },
        },
        calendarEvents: {
          select: {
            startDate: true,
            endDate: true,
            summary: true,
          },
        },
        calendarLinks: {
          select: {
            bufferBefore: true,
            bufferAfter: true,
            lastFetchedAt: true,
            lastError: true,
          },
        },
        dateOverrides: {
          select: { date: true, type: true },
        },
      },
    });
    if (query.propertyId && properties.length === 0) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const results = properties.map((property) =>
      evaluatePropertyAvailability(property, query, evaluatedAt),
    );
    const available = results.filter((property) => property.dateStatus === "available");
    const unavailable = results.filter((property) => property.dateStatus === "unavailable");

    return NextResponse.json(
      {
        query,
        evaluatedAt: evaluatedAt.toISOString(),
        timezone: "America/La_Paz",
        available,
        unavailable,
        summary: {
          checked: results.length,
          available: available.length,
          unavailable: unavailable.length,
          requiresHumanReview: available.filter((property) => property.requiresHumanReview)
            .length,
        },
        warnings: query.guests
          ? ["Guest capacity is not stored yet; date availability only"]
          : [],
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof MessagingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Messaging availability route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
