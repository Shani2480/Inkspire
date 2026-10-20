/** The Google Form that collects feedback; the answers land in its linked sheet. */
export const FEEDBACK_FORM =
  "https://docs.google.com/forms/d/e/1FAIpQLSf6vpE9aSTOn7GyPKWasZlH85Ikeu6IVtkHIzc7s7Ud8qGIbQ/formResponse"

const FIELDS = {
  kind: "entry.1241092603",
  message: "entry.2091830440",
  version: "entry.1125344020",
  details: "entry.761544046",
}

export type Feedback = { kind: string; message: string; version: string; details: string }

export function feedbackBody(feedback: Feedback) {
  return new URLSearchParams({
    [FIELDS.kind]: feedback.kind,
    [FIELDS.message]: feedback.message,
    [FIELDS.version]: feedback.version,
    [FIELDS.details]: feedback.details,
  })
}

/**
 * Posts one answer to the form. Google answers a form post without allowing a page to read the reply, so this
 * can only tell that the request went out, not that it was stored.
 */
export async function sendFeedback(feedback: Feedback) {
  await fetch(FEEDBACK_FORM, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: feedbackBody(feedback),
  })
}
