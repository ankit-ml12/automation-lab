// Thin wrapper around the Microsoft Graph mail endpoints we need.

const GRAPH = "https://graph.microsoft.com/v1.0";

/**
 * Fetch inbox messages received after `sinceIso`, newest first.
 * Only the fields needed for OTP extraction are requested.
 */
export async function fetchMessagesSince(accessToken, sinceIso, top = 10) {
  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${sinceIso}`,
    $orderby: "receivedDateTime desc",
    $top: String(top),
    $select: "id,subject,bodyPreview,body,from,receivedDateTime",
  });
  const res = await fetch(`${GRAPH}/me/mailFolders/inbox/messages?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.body-content-type="text"',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Graph request failed: ${res.status} ${res.statusText} ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.value ?? []).map((m) => ({
    id: m.id,
    subject: m.subject ?? "",
    body: m.body?.content ?? m.bodyPreview ?? "",
    bodyIsHtml: (m.body?.contentType ?? "text").toLowerCase() === "html",
    from: m.from?.emailAddress?.address ?? "",
    receivedAt: Date.parse(m.receivedDateTime),
  }));
}
