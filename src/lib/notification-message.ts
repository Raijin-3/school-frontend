export type NotificationPayload = {
  action_label?: string | null
  metadata?: Record<string, string | null> | null
  message?: string | null
}

export function getNotificationMessage(notification: NotificationPayload) {
  const normalizedLabel = (notification.action_label ?? "").trim().toLowerCase()
  if (normalizedLabel === "revision notes on weak areas.") {
    const sectionTitle = notification.metadata?.sectionTitle?.trim()
    if (sectionTitle) {
      return `Revision notes on ${sectionTitle} are ready - review them to shore up the weak areas.`
    }
    return "Revision notes on this section are ready - review them to shore up the weak areas."
  }
  return notification.message || ""
}
