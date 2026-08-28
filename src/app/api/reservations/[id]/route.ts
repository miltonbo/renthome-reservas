import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canManageProperty } from "@/lib/ownership";
import { normalizePhone } from "@/lib/sanitize";
import { parseReservationDate } from "@/lib/reservation-dates";
import { loadEffectiveLinkedStayRange } from "@/lib/linked-stay";
import { isAvailabilityBlockSummary } from "@/lib/calendar-event-kind";
import { amountToMinor, financialAllocations, isCurrency } from "@/lib/finance";

async function loadManageableReservation(
  reservationId: number,
  userId: number,
  role: string
) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      propertyId: true,
      platform: true,
      linkedEventUid: true,
      linkedEventPlatform: true,
      linkedEventRole: true,
      status: true,
      checkIn: true,
      checkOut: true,
    },
  });
  if (!reservation) return null;
  if (!(await canManageProperty(reservation.propertyId, userId, role))) return null;
  return reservation;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const numId = parseInt(id);
    if (isNaN(numId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const owned = await loadManageableReservation(numId, session.userId, session.role);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (owned.status === "cancelled") {
      return NextResponse.json({ error: "Cancelled reservation cannot be edited" }, { status: 409 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.bookingOriginalPropertyId !== undefined) {
      if (body.bookingOriginalPropertyId !== null && (!Number.isInteger(body.bookingOriginalPropertyId) || body.bookingOriginalPropertyId <= 0 || !(await canManageProperty(body.bookingOriginalPropertyId, session.userId, session.role)))) {
        return NextResponse.json({ error: "Invalid Booking original property" }, { status: 400 });
      }
      data.bookingOriginalPropertyId = body.bookingOriginalPropertyId;
    }

    if (body.name !== undefined) data.name = body.name;
    if (body.checkIn !== undefined) {
      const checkIn = parseReservationDate(body.checkIn);
      if (!checkIn) {
        return NextResponse.json({ error: "Invalid checkIn date" }, { status: 400 });
      }
      data.checkIn = checkIn;
    }
    if (body.checkOut !== undefined) {
      const checkOut = parseReservationDate(body.checkOut);
      if (!checkOut) {
        return NextResponse.json({ error: "Invalid checkOut date" }, { status: 400 });
      }
      data.checkOut = checkOut;
    }
    if (body.platform !== undefined) {
      // A linked row's channel is part of its durable semantics: claims use
      // the source channel while manually paid extensions are Direct. Source
      // identity lives in linkedEventPlatform and cannot be rewritten through
      // this general reservation edit endpoint.
      if (owned.linkedEventUid && body.platform !== owned.platform) {
        return NextResponse.json(
          { error: "Linked booking platform cannot be changed" },
          { status: 409 },
        );
      }
      data.platform = body.platform;
    }
    const nullableAmounts = [
      "nightlyPrice",
      "totalPrice",
      "guaranteeAmount",
      "parkingNightlyPrice",
      "parkingTotalPrice",
    ] as const;
    for (const field of nullableAmounts) {
      if (body[field] === undefined) continue;
      const value = body[field];
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
      }
      data[field] = value;
    }
    for (const field of ["priceCurrency", "guaranteeCurrency", "parkingCurrency"] as const) {
      if (body[field] === undefined) continue;
      if (!isCurrency(body[field])) {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
      }
      data[field] = body[field];
    }
    if (body.hasParking !== undefined) {
      if (typeof body.hasParking !== "boolean") {
        return NextResponse.json({ error: "Invalid hasParking" }, { status: 400 });
      }
      data.hasParking = body.hasParking;
      if (!body.hasParking) {
        data.parkingNightlyPrice = null;
        data.parkingTotalPrice = null;
      }
    }
    if (body.settledManually !== undefined) {
      if (typeof body.settledManually !== "boolean") {
        return NextResponse.json({ error: "Invalid settledManually" }, { status: 400 });
      }
      data.settledManuallyAt = body.settledManually ? new Date() : null;
    }

    if (body.note !== undefined) {
      if (body.note !== null && typeof body.note !== "string") {
        return NextResponse.json({ error: "Invalid note" }, { status: 400 });
      }
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (note.length > 2000) {
        return NextResponse.json({ error: "Note is too long" }, { status: 400 });
      }
      data.note = note || null;
    }

    // Host-editable group-chat name override. Empty string / whitespace
    // clears it (back to the auto-generated name); otherwise store the
    // trimmed text.
    if (body.groupName !== undefined) {
      const v = typeof body.groupName === "string" ? body.groupName.trim() : "";
      data.groupName = v === "" ? null : v;
    }

    // Per-reservation messenger group URLs. Empty string clears the
    // value (null in DB); a real URL must start with the platform's
    // canonical public prefix so we don't accidentally save a chat
    // deep-link, an Android intent URL, or anything that won't open
    // a group page in the desktop / mobile messenger.
    if (body.tgGroupUrl !== undefined) {
      const v = typeof body.tgGroupUrl === "string" ? body.tgGroupUrl.trim() : "";
      if (v === "") {
        data.tgGroupUrl = null;
      } else if (!/^https:\/\/t\.me\//i.test(v)) {
        return NextResponse.json(
          { error: "Telegram group URL must start with https://t.me/" },
          { status: 400 },
        );
      } else {
        data.tgGroupUrl = v;
      }
    }
    if (body.waGroupUrl !== undefined) {
      const v = typeof body.waGroupUrl === "string" ? body.waGroupUrl.trim() : "";
      if (v === "") {
        data.waGroupUrl = null;
      } else if (!/^https:\/\/chat\.whatsapp\.com\//i.test(v)) {
        return NextResponse.json(
          { error: "WhatsApp group URL must start with https://chat.whatsapp.com/" },
          { status: 400 },
        );
      } else {
        data.waGroupUrl = v;
      }
    }

    // Reservation contact phone — same loose-E.164 normalisation the
    // Guest.phone PATCH uses so the host can use the same input shape
    // and the WA/TG deeplinks resolve cleanly. Empty clears.
    if (body.phone !== undefined) {
      const v = typeof body.phone === "string" ? body.phone : "";
      try {
        const normalised = normalizePhone(v);
        data.phone = normalised === "" ? null : normalised;
      } catch {
        return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
      }
    }

    // If the date range is changing, check for overlap with OTHER
    // reservations on the same property. The POST endpoint already
    // does this for new reservations; PATCH was missing the same
    // guard, which let a host shorten or extend a reservation into
    // a range covered by another reservation — silent double-booking.
    if (data.checkIn !== undefined || data.checkOut !== undefined) {
      const current = await prisma.reservation.findUnique({
        where: { id: numId },
        select: { checkIn: true, checkOut: true, propertyId: true },
      });
      if (current) {
        const newCheckIn = (data.checkIn as Date | undefined) ?? current.checkIn;
        const newCheckOut = (data.checkOut as Date | undefined) ?? current.checkOut;
        if (newCheckOut <= newCheckIn) {
          return NextResponse.json({ error: "checkOut must be after checkIn" }, { status: 400 });
        }
        const overlap = await prisma.reservation.findFirst({
          where: {
            propertyId: current.propertyId,
            id: { not: numId },
            status: "confirmed",
            checkIn: { lt: newCheckOut },
            checkOut: { gt: newCheckIn },
          },
          select: { name: true, checkIn: true, checkOut: true },
        });
        if (overlap) {
          return NextResponse.json(
            {
              error: "Overlapping reservation exists",
              existing: {
                name: overlap.name,
                checkIn: overlap.checkIn,
                checkOut: overlap.checkOut,
              },
            },
            { status: 409 },
          );
        }

        // Same synced-event check the POST endpoint runs — a host
        // editing a reservation's dates can't extend / shift it into
        // a range already covered by an iCal-imported event from
        // another platform.
        const newStartStr = newCheckIn.toISOString().substring(0, 10);
        const newEndStr = newCheckOut.toISOString().substring(0, 10);
        const currentStartStr = current.checkIn.toISOString().substring(0, 10);
        const currentEndStr = current.checkOut.toISOString().substring(0, 10);
        let sourceIdentity: { platform: string; uid: string } | null = null;

        // Explicit linkedEventRole makes claim vs extension durable even if
        // the source platform later changes its dates. Legacy rows without
        // the new fields retain the old geometry-based fallback.
        if (owned.linkedEventUid) {
          const sourcePlatform = owned.linkedEventPlatform || owned.platform;
          const linkedSource = await prisma.calendarEvent.findFirst({
            where: {
              propertyId: current.propertyId,
              platform: sourcePlatform,
              uid: owned.linkedEventUid,
            },
            select: { startDate: true, endDate: true },
          });
          if (linkedSource) {
            const effectiveSource = await loadEffectiveLinkedStayRange({
              propertyId: current.propertyId,
              sourcePlatform,
              sourceUid: owned.linkedEventUid,
              source: linkedSource,
            });
            sourceIdentity = {
              platform: sourcePlatform,
              uid: owned.linkedEventUid,
            };
            const currentlyOverlapsSource =
              effectiveSource.startDate < currentEndStr &&
              effectiveSource.endDate > currentStartStr;
            const currentlyAdjacentToSource =
              currentEndStr === effectiveSource.startDate ||
              currentStartStr === effectiveSource.endDate;
            const nextOverlapsSource =
              effectiveSource.startDate < newEndStr &&
              effectiveSource.endDate > newStartStr;
            const nextIsAdjacentToSource =
              newEndStr === effectiveSource.startDate ||
              newStartStr === effectiveSource.endDate;
            const role =
              owned.linkedEventRole ||
              (currentlyOverlapsSource
                ? "claim"
                : currentlyAdjacentToSource
                  ? "extension"
                  : null);
            const relationshipChanged =
              role === "claim"
                ? !nextOverlapsSource
                : role === "extension"
                  ? nextOverlapsSource || !nextIsAdjacentToSource
                  : currentlyOverlapsSource !== nextOverlapsSource ||
                    (!nextOverlapsSource && !nextIsAdjacentToSource);
            if (relationshipChanged) {
              return NextResponse.json(
                { error: "Linked booking relationship cannot be changed" },
                { status: 409 },
              );
            }
          }
        } else {
          // Older data can contain a locally named Reservation that
          // overlaps an iCal row without linkedEventUid. The calendar
          // already renders those as one unioned stay. Recognize that
          // implicit claim while editing so extending the visible bar
          // does not conflict with its own source event. The updated
          // range must continue to overlap the source; every other event
          // is still checked below.
          const implicitSource = await prisma.calendarEvent.findFirst({
            where: {
              propertyId: current.propertyId,
              platform: owned.platform,
              startDate: { lt: currentEndStr },
              endDate: { gt: currentStartStr },
            },
            select: { uid: true, startDate: true, endDate: true },
          });
          if (implicitSource) {
            const nextOverlapsSource =
              implicitSource.startDate < newEndStr &&
              implicitSource.endDate > newStartStr;
            // Unlike an explicit linked claim, this legacy association
            // is only inferred. If the host moves the manual row away,
            // let it become independent again; the normal new-range
            // overlap query below will still reject any real conflict.
            if (nextOverlapsSource) {
              sourceIdentity = {
                platform: owned.platform,
                uid: implicitSource.uid,
              };
            }
          }
        }

        const syncedOverlapWhere = {
            propertyId: current.propertyId,
            startDate: { lt: newEndStr },
            endDate: { gt: newStartStr },
            // A claimed iCal booking has a local Reservation row for
            // guest details and a linked CalendarEvent for the source
            // platform. The calendar intentionally renders the UNION
            // of their ranges, so the host can correct or extend dates
            // that the source feed truncated. Do not let that source
            // event conflict with its own local reservation; every
            // other synced event must still block the edit.
            ...(sourceIdentity ? { NOT: sourceIdentity } : {}),
        };
        let syncedOverlap = await prisma.calendarEvent.findFirst({
          where: syncedOverlapWhere,
          select: { summary: true, platform: true, startDate: true, endDate: true },
        });
        const ignoredAvailabilityBlocks: Array<{
          summary: string;
          platform: string;
          startDate: string;
          endDate: string;
        }> = [];
        while (
          syncedOverlap &&
          isAvailabilityBlockSummary(syncedOverlap.summary) &&
          ignoredAvailabilityBlocks.length < 100
        ) {
          ignoredAvailabilityBlocks.push(syncedOverlap);
          syncedOverlap = await prisma.calendarEvent.findFirst({
            where: {
              ...syncedOverlapWhere,
              AND: ignoredAvailabilityBlocks.map((block) => ({ NOT: block })),
            },
            select: { summary: true, platform: true, startDate: true, endDate: true },
          });
        }
        if (syncedOverlap) {
          return NextResponse.json(
            {
              error: "Overlapping booking from another platform",
              existing: {
                name: syncedOverlap.summary || syncedOverlap.platform,
                checkIn: syncedOverlap.startDate,
                checkOut: syncedOverlap.endDate,
                platform: syncedOverlap.platform,
              },
            },
            { status: 409 },
          );
        }
      }
    }

    const reservation = await prisma.reservation.update({
      where: { id: numId },
      data,
    });

    if (reservation.platform === "airbnb" && reservation.totalPrice != null && "moneyMovement" in prisma) {
      const property = await prisma.property.findUnique({
        where: { id: reservation.propertyId }, select: { financialOperator: true, financialModel: true, managementFeeBps: true, managementBeneficiary: true },
      });
      const amountMinor = amountToMinor(reservation.totalPrice);
      const allocations = financialAllocations(amountMinor, property || {});
      const existing = await prisma.moneyMovement.findFirst({
        where: { reservationId: reservation.id, source: "airbnb", paymentMethod: "airbnb", type: "lodging" },
      });
      if (existing) {
        await prisma.$transaction([
          prisma.moneyAllocation.deleteMany({ where: { moneyMovementId: existing.id } }),
          prisma.moneyMovement.update({
            where: { id: existing.id },
            data: { amountMinor, currency: "USD", allocations: { create: allocations } },
          }),
        ]);
      }
    }

    // Same cleanup as the POST path — clear open/closed overrides on
    // the reservation's current date range so they don't shadow the
    // booking. We do this even if the date range didn't change in
    // this PATCH (cheap deleteMany, idempotent), so a host who first
    // creates an override and then later edits a reservation that
    // already covered those dates also gets the cleanup.
    {
      const datesToClear: string[] = [];
      const start = new Date(reservation.checkIn);
      const end = new Date(reservation.checkOut);
      const d = new Date(start);
      while (d < end) {
        datesToClear.push(d.toISOString().substring(0, 10));
        d.setDate(d.getDate() + 1);
      }
      if (datesToClear.length > 0) {
        await prisma.dateOverride.deleteMany({
          where: {
            propertyId: reservation.propertyId,
            date: { in: datesToClear },
            type: { in: ["open", "closed"] },
          },
        });
      }
    }

    await logAudit(session.userId, "update", "reservation", numId, data);
    return NextResponse.json(reservation);
  } catch (err) {
    console.error("Route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const numId = parseInt(id);
    if (isNaN(numId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const owned = await loadManageableReservation(numId, session.userId, session.role);
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.reservation.delete({ where: { id: numId } });

    // Claims and direct extensions are now explicitly distinguished. Never
    // infer a durable extension from today's overlap alone: an OTA may expand
    // its event after the Direct segment was created, and cancelling those
    // added nights must still leave the real source booking untouched.
    // Null-role legacy rows are deliberately treated as ambiguous. Geometry
    // can change after an OTA refresh, so deleting a cached source event is
    // safe only for a durable, explicit claim. Preserving the source may make
    // an old unclassified bar reappear, but can never erase the real booking.
    if (owned.linkedEventUid && owned.linkedEventRole === "claim") {
      const sourcePlatform = owned.linkedEventPlatform || owned.platform;
      const linked = await prisma.calendarEvent.findFirst({
        where: {
          propertyId: owned.propertyId,
          platform: sourcePlatform,
          uid: owned.linkedEventUid,
        },
        select: { id: true, startDate: true, endDate: true },
      });
      if (linked) {
        await prisma.calendarEvent.delete({ where: { id: linked.id } });
      }
    }

    await logAudit(session.userId, "delete", "reservation", numId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
