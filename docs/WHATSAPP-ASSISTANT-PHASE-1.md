# WhatsApp assistant — phase 1 foundation

This phase adds only the durable, text-based conversation memory required by
the assisted workflow. It does not connect WhatsApp, call an AI model, store
media, send Telegram notifications, or reply to guests.

## Decisions represented in the API

- DeptosBO is the source of truth for conversation history.
- Audio, images, video, and documents are processed transiently outside the
  database. Only a transcript or textual interpretation is accepted.
- A conversation is durable; individual needs are separate cases.
- History is loaded progressively in pages of 1–100 messages.
- `historyExhausted` explicitly tells the orchestrator when DeptosBO has no
  earlier messages. If the case is still ambiguous, it must call the human
  assignment endpoint.
- Phase 1 remains human-operated. Future AI responses will go to Telegram as
  suggestions and will not be sent to WhatsApp automatically.

## Initial endpoints

All messaging endpoints accept the normal signed-in session or the dedicated
n8n credential:

```http
Authorization: Bearer <MESSAGING_API_KEY>
```

The secret and its scoped DeptosBO user are configured through
`MESSAGING_API_KEY` and `MESSAGING_API_USER_ID`. Keys in query strings are not
accepted. Production requests must use HTTPS.

### `POST /api/messaging/messages`

Creates or reuses the contact and conversation, then stores one lightweight
message. `providerMessageId` makes webhook retries idempotent within a
conversation.

Required fields:

- `externalContactId`
- `direction`: `inbound` or `outbound`
- `textContent`, except when `processingStatus` is `failed`

Relevant optional fields include `displayName`, `providerMessageId`,
`authorType`, `messageType`, `language`, `interpretationConfidence`,
`requiresHumanReview`, `replyToProviderMessageId`, `occurredAt`, and `caseId`.

Media-shaped fields such as `mediaUrl`, `mediaBase64`, `file`, or `attachment`
are rejected.

### `GET /api/messaging/availability`

Evaluates date availability without modifying inventory. Required query
parameters are `checkIn` and `checkOut` in `YYYY-MM-DD` format. Optional
parameters are `propertyId` and `guests`.

The response separates `available` and `unavailable` properties. It applies
confirmed DeptosBO reservations, imported calendar bookings and host blocks,
manual closed/cleaning dates, minimum nights, booking window, paused-property
state, and the maximum cleaning buffer configured across connected channels.
Manual `open` dates can override a cleaning buffer but never an actual
reservation or imported calendar block.

Each available result includes `calendarStatus`. Only `current` means all
connected calendars were synchronized successfully in the last 120 minutes.
The other values (`stale`, `sync_error`, `never_synced`, `not_connected`) set
`requiresHumanReview` so the assistant cannot present tentative inventory as
confirmed.

DeptosBO does not yet store the maximum guest capacity of each property. When
`guests` is supplied, the API evaluates dates but returns
`capacityVerified: false`, a warning, and `requiresHumanReview: true`. Prices
and guest identities are never returned by this endpoint.

### `GET /api/messaging/conversations/:id/context`

Returns the conversation, contact, related cases, and a chronological page of
messages. Query parameters:

- `limit`: defaults to 20; maximum 100.
- `beforeMessageId`: cursor returned by the previous page.

The pagination object contains `hasMore`, `historyExhausted`, and
`nextBeforeMessageId`.

### `PATCH /api/messaging/conversations/:id`

Supported actions:

- `assign_human`: assigns the conversation to the signed-in operator and
  records the reason.
- `reactivate`: returns it to active assisted processing.
- `close`: closes the conversation thread without deleting its history.

### `POST /api/messaging/cases`

Creates one operational case and links the messages that originated it. The
body requires `conversationId` and `messageIds` (between 1 and 100 IDs from
that same conversation). Repeating the request with already-linked triggering
messages returns the existing case, which makes n8n retries safe.

Optional fields are `reservationId`, `propertyId`, `type`, `status`,
`priority`, and `summary`. When a reservation is supplied, the API infers its
property and verifies that the integration user can manage it. It never reveals
or links inaccessible records.

Supported types are `unknown`, `availability`, `reservation`, `payment`,
`arrival`, `departure`, `incident`, `cancellation`, `guarantee`, `complaint`,
and `property_management`. Priorities are `low`, `normal`, `high`, and
`urgent`.

### `PATCH /api/messaging/cases/:id`

Supported actions:

- `update`: changes supplied classification, summary, status, priority, links,
  or attaches additional unassigned messages from the same conversation.
- `assign_human`: assigns both the case and its conversation to the integration
  user. Assisted processing must not send a guest response while this state is
  active.
- `resolve` or `close`: records `closedAt`, optionally stores `resolution`, and
  reactivates the conversation only if no other human-assigned case remains.
- `reopen`: clears the prior resolution and returns the case to `new`.

Active lifecycle values accepted directly by `status` are `new`, `waiting_info`,
`quote_ready`, `awaiting_customer`, `awaiting_payment`, `confirmed`,
`pre_arrival`, `checked_in`, `incident_open`, `checkout`, and `refund_pending`.
The states `human_assigned`, `resolved`, and `closed` are reached only through
their explicit actions so assignment and close metadata remain consistent.

## Next implementation slice

1. Implement transient media processing and guaranteed cleanup.
2. Add the context-selection and classification service.
3. Send proposed responses and feedback actions to Telegram.
4. Connect the WhatsApp webhook after validating the workflow end to end.
