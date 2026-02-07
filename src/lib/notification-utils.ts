export type NotificationMetadata = Record<string, string | null> | null

export function formatNotificationTime(value?: string | null) {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

export function getNotificationMetadataLine(metadata?: NotificationMetadata) {
  if (!metadata) {
    return null
  }
  const parts: string[] = []
  const sectionTitle = metadata.sectionTitle?.trim()
  if (sectionTitle) {
    parts.push(sectionTitle)
  }
  const classTiming = metadata.classTiming?.trim()
  if (classTiming) {
    parts.push(classTiming)
  }
  return parts.length ? parts.join(" - ") : null
}
