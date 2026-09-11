# RentHome Departamentos API

All endpoints are JSON unless noted. Base URL: `/`.

## Authentication

A successful `POST /api/auth/login` sets the `deptosbo-session` cookie (HTTP-only, JWT).
The middleware in `src/middleware.ts` rejects any request without a valid session
cookie with `401 { "error": "Unauthorized" }`, except for these public paths:

- `/api/auth/login`
- `/api/calendar/feed/*`
- `/api/calendar/cron`

In the table below, **Auth** = `session` means a valid session cookie is required;
`public` means no auth needed; `cron` means it expects `?token=$CRON_SECRET`.

Errors follow `{ "error": string }`. Standard codes:

- `400` — invalid input (missing field, malformed body, bad ID)
- `401` — missing or invalid session
- `404` — record not found
- `409` — conflict (e.g. overlapping reservation)
- `500` — unhandled server error

---

## Assisted messaging foundation

The initial WhatsApp-assistant API is documented in
[`WHATSAPP-ASSISTANT-PHASE-1.md`](./WHATSAPP-ASSISTANT-PHASE-1.md). It stores
text and structured metadata only; binary media is explicitly rejected.

- `POST /api/messaging/messages` — idempotently ingest a textual message.
- `GET /api/messaging/availability` — evaluate read-only date availability
  with calendar freshness and human-review safeguards.
- `GET /api/messaging/conversations/[id]/context` — retrieve progressively
  older context, up to 100 messages per page.
- `PATCH /api/messaging/conversations/[id]` — assign to a human, reactivate,
  or close a conversation.
- `POST /api/messaging/cases` — idempotently create an operational case and
  link its triggering messages.
- `PATCH /api/messaging/cases/[id]` — update, assign, resolve, close, or reopen
  a case and attach further messages.

---

## Auth

### `POST /api/auth/login` — public
Body: `{ "username": string, "password": string }`
On success: sets `deptosbo-session` cookie; returns `{ user: { userId, username, role } }`.
On failure: `401 { "error": "Invalid credentials" }`.

### `POST /api/auth/logout` — session
Clears the session cookie. Returns `{ success: true }`.

### `GET /api/auth/session` — session
Returns the current user: `{ userId, username, role }` or `401`.

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"secret123"}' \
  https://app.example.com/api/auth/login
```

---

## Properties

### `GET /api/properties` — session
Returns `Property[]` with nested `reservations`, `calendarLinks`, and counts.

### `POST /api/properties` — session
Body: `{ "name": string, "minNights"?: number, "checkInTime"?: "HH:MM",
"checkOutTime"?: "HH:MM", "bookingWindow"?: number }`.
Returns the created `Property`.

### `PATCH /api/properties/[id]` — session
Body: any subset of the POST fields. Returns the updated `Property` or `400` for non-numeric `id`.

### `DELETE /api/properties/[id]` — session
Cascade-deletes the property and all related reservations/guests/links/events.
Returns `{ success: true }`.

---

## Reservations

### `GET /api/reservations?propertyId=X` — session
Returns `Reservation[]` with `_count.guests`. `propertyId` query param is required.

### `POST /api/reservations` — session
Body: `{ "name": string, "checkIn": ISODate, "checkOut": ISODate, "platform"?: "airbnb"|"booking"|"direct", "propertyId": number, "linkedEventUid"?: string }`.
Validates that `checkIn`/`checkOut` are valid dates and `checkOut > checkIn`.
Returns `409` if dates overlap an existing reservation for the same property.

### `PATCH /api/reservations/[id]` — session
Body: any of `{ name?, checkIn?, checkOut?, platform? }`.

### `DELETE /api/reservations/[id]` — session
Cascade-deletes the reservation and its guests.

---

## Guests

### `GET /api/guests?reservationId=X` — session
Returns `Guest[]` for the reservation, ordered by id.

### `PATCH /api/guests/[id]` — session
Body: any subset of guest fields plus `parentId` (for child→adult linkage).
`passportNumber` is stripped of whitespace; `issuedBy` is sanitized to Latin
letters/digits/spaces. Returns the updated `Guest`.

### `DELETE /api/guests/[id]` — session
Returns `{ success: true }`.

---

## Users

### `GET /api/users` — session
Returns `User[]` (without password hashes).

### `POST /api/users` — session, **superadmin only**
Body: `{ "username": string, "password": string (>= 8 chars), "role"?: "user"|"superadmin" }`.

### `DELETE /api/users/[id]` — session, superadmin only

---

## Settings

### `GET /api/settings` — session
Returns `{ [key]: string }` of all `AppSettings` rows.

### `PUT /api/settings` — session
Body: `{ [key]: string }`. Upserts each key/value.

---

## Passport extraction

### `POST /api/extract` — session
`multipart/form-data` body:
- `files` — one or more JPG/PNG/PDF passport images
- `reservationId` — string (numeric)

Calls Gemini Vision, sanitizes results, and creates `Guest` rows linked to the reservation.
Returns `{ data: SavedItem[] }` where each item is either a created guest, a `_action: "visa_updated"` guest, or `_action: "visa_no_match"`.

```bash
curl -b cookies.txt \
  -F "files=@passport.jpg" \
  -F "reservationId=42" \
  https://app.example.com/api/extract
```

---

## Calendar

### `GET /api/calendar/links?propertyId=X` — session
Returns `CalendarLink[]` for the property.

### `POST /api/calendar/links` — session
Body: `{ propertyId, platform: "airbnb"|"booking", icalExportUrl, bufferBefore?, bufferAfter? }`.

### `PATCH /api/calendar/links/[id]` — session
Update buffers or URL.

### `DELETE /api/calendar/links/[id]` — session

### `POST /api/calendar/sync` — session
Triggers a sync of all calendar links across all properties. Returns
`{ propertiesSynced, eventsCreated, eventsUpdated, errors }`.

### `GET /api/calendar/sync?propertyId=X` — session
Returns last-sync metadata: `{ lastFetchedAt, lastError, eventCounts: { airbnb, booking } }`.

### `POST /api/calendar/test` — session
Body: `{ icalExportUrl }`. Fetches and validates the URL without saving.
Returns `{ ok, eventCount, error? }`.

### `GET /api/calendar/feed/[propertyId]` — public
Public iCal feed (`text/calendar`) of buffered events for the property,
intended to be imported by Airbnb / Booking.com. Optional `?platform=` filter.

### `GET /api/calendar/feed/[propertyId]/[filename]` — public
Same content as above; the trailing filename is for platform compatibility
(some require a `.ics` suffix in the URL).

### `GET /api/calendar/cron?token=$CRON_SECRET` — cron
Triggers the same sync as `POST /api/calendar/sync` but is meant to be hit
by an external scheduler (cron-job.org). Rejects requests with the wrong token.

### `GET /api/calendar/schedule` / `PUT /api/calendar/schedule` — session
Reads / updates the cron schedule settings.

### `GET /api/calendar/health` — session
Returns per-property feed status: `{ properties: [{ id, name, airbnbFeed: { url, status, eventCount }, bookingFeed: {...} }] }`.

---

## Date overrides

### `GET /api/date-overrides?propertyId=X` — session

### `POST /api/date-overrides` — session
Body: `{ propertyId, date: "YYYY-MM-DD", type: "open"|"closed", note?: string }`.

### `DELETE /api/date-overrides?id=X` — session
