import { config } from "dotenv";

config({ path: ".env.local" });

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const messagingApiKey = process.env.MESSAGING_API_KEY ?? "";
if (messagingApiKey.length < 32) {
  throw new Error("A strong MESSAGING_API_KEY is required for the smoke test");
}

const marker = `smoke-${Date.now()}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function api(path: string, apiKey: string, init?: RequestInit) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  let createdCaseId: number | null = null;

try {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const availabilityResponse = await api(
    `/api/messaging/availability?checkIn=${today}&checkOut=${addDays(today, 1)}&guests=2`,
    messagingApiKey,
  );
  assert(
    availabilityResponse.status === 200,
    `Availability returned ${availabilityResponse.status}`,
  );
  const availability = await availabilityResponse.json();
  assert(availability.summary.checked > 0, "Availability did not check any properties");
  assert(
    availability.summary.available + availability.summary.unavailable ===
      availability.summary.checked,
    "Availability totals are inconsistent",
  );
  assert(
    availability.warnings.some((warning: string) => warning.includes("capacity")),
    "Availability did not flag unknown guest capacity",
  );

  const rejected = await api("/api/messaging/messages", `${messagingApiKey}wrong`, {
    method: "POST",
    body: JSON.stringify({
      externalContactId: marker,
      direction: "inbound",
      textContent: "No debe almacenarse",
    }),
  });
  assert(rejected.status === 401, `Invalid API key returned ${rejected.status}`);

  let conversationId: number | null = null;
  const messageIds: number[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const response = await api("/api/messaging/messages", messagingApiKey, {
      method: "POST",
      body: JSON.stringify({
        externalContactId: marker,
        displayName: "Prueba temporal",
        providerMessageId: `${marker}-${index}`,
        direction: index === 2 ? "outbound" : "inbound",
        authorType: index === 2 ? "human" : "customer",
        textContent: `Mensaje temporal ${index}`,
        occurredAt: new Date(Date.now() + index * 1_000).toISOString(),
      }),
    });
    assert(response.status === 201, `Message ${index} returned ${response.status}`);
    const body = await response.json();
    conversationId ??= body.conversation.id;
    messageIds.push(body.message.id);
    assert(body.conversation.id === conversationId, "Messages split across conversations");
  }
  assert(conversationId, "No conversation was created");
  assert(messageIds.length === 3, "Message IDs were not returned");

  const duplicate = await api("/api/messaging/messages", messagingApiKey, {
    method: "POST",
    body: JSON.stringify({
      externalContactId: marker,
      providerMessageId: `${marker}-1`,
      direction: "inbound",
      textContent: "Este contenido no debe duplicarse",
    }),
  });
  assert(duplicate.status === 200, `Duplicate returned ${duplicate.status}`);
  assert((await duplicate.json()).duplicate === true, "Duplicate was not detected");

  const firstPage = await api(
    `/api/messaging/conversations/${conversationId}/context?limit=2`,
    messagingApiKey,
  );
  assert(firstPage.status === 200, `First context page returned ${firstPage.status}`);
  const firstBody = await firstPage.json();
  assert(firstBody.messages.length === 2, "First context page has the wrong size");
  assert(firstBody.pagination.hasMore === true, "First page should have more history");
  assert(
    typeof firstBody.pagination.nextBeforeMessageId === "number",
    "First page did not return a cursor",
  );

  const secondPage = await api(
    `/api/messaging/conversations/${conversationId}/context?limit=2&beforeMessageId=${firstBody.pagination.nextBeforeMessageId}`,
    messagingApiKey,
  );
  assert(secondPage.status === 200, `Second context page returned ${secondPage.status}`);
  const secondBody = await secondPage.json();
  assert(secondBody.messages.length === 1, "Second context page has the wrong size");
  assert(
    secondBody.pagination.historyExhausted === true,
    "Second page should report exhausted history",
  );

  const caseCreation = await api("/api/messaging/cases", messagingApiKey, {
    method: "POST",
    body: JSON.stringify({
      conversationId,
      messageIds: [messageIds[2]],
      type: "availability",
      summary: "Consulta temporal de disponibilidad",
    }),
  });
  assert(caseCreation.status === 201, `Case creation returned ${caseCreation.status}`);
  const caseBody = await caseCreation.json();
  const caseId = caseBody.conversationCase.id as number;
  createdCaseId = caseId;

  const caseRetry = await api("/api/messaging/cases", messagingApiKey, {
    method: "POST",
    body: JSON.stringify({
      conversationId,
      messageIds: [messageIds[2]],
      type: "availability",
    }),
  });
  assert(caseRetry.status === 200, `Case retry returned ${caseRetry.status}`);
  assert((await caseRetry.json()).duplicate === true, "Case retry was not idempotent");

  const assignment = await api(`/api/messaging/cases/${caseId}`, messagingApiKey, {
    method: "PATCH",
    body: JSON.stringify({
      action: "assign_human",
    }),
  });
  assert(assignment.status === 200, `Case assignment returned ${assignment.status}`);

  const resolution = await api(`/api/messaging/cases/${caseId}`, messagingApiKey, {
    method: "PATCH",
    body: JSON.stringify({
      action: "resolve",
      resolution: "Caso temporal resuelto",
    }),
  });
  assert(resolution.status === 200, `Case resolution returned ${resolution.status}`);

  const stored = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: true, cases: true },
  });
  assert(stored?.status === "active", "Conversation was not reactivated after resolution");
  assert(stored.messages.length === 3, "Webhook retry created a duplicate message");
  assert(stored.cases.length === 1, "Case retry created a duplicate case");
  assert(stored.cases[0].status === "resolved", "Case was not resolved");
  assert(
    stored.messages.some((message) => message.id === messageIds[2] && message.caseId === caseId),
    "Triggering message was not linked to case",
  );

  console.log(
    JSON.stringify({
      ok: true,
      invalidKeyRejected: true,
      availabilityReadOnly: true,
      propertiesChecked: availability.summary.checked,
      messagesCreated: stored.messages.length,
      duplicateRejected: true,
      progressiveHistory: true,
      historyExhausted: true,
      humanAssignment: true,
      caseRetrySafe: true,
      caseResolved: true,
      conversationReactivated: true,
    }),
  );
} finally {
  if (createdCaseId) {
    await prisma.auditLog.deleteMany({
      where: { resourceType: "conversationCase", resourceId: createdCaseId },
    });
  }
  await prisma.messagingContact.deleteMany({
    where: { externalId: marker },
  });
  const remaining = await prisma.messagingContact.count({
    where: { externalId: marker },
  });
  if (remaining !== 0) throw new Error("Smoke-test data cleanup failed");
  await prisma.$disconnect();
}
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
