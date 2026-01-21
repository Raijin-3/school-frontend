const DEFAULT_LEVEL_BASE_INCREMENT = 1000

function resolveLevelBaseIncrement(): number {
  const raw = 1000
  if (raw) {
    const parsed = Number(raw)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return DEFAULT_LEVEL_BASE_INCREMENT
}

function getThresholdForLevel(level: number, increment: number) {
  if (level <= 1) {
    return 0
  }
  return Math.round((level - 1) * increment)
}

export type LevelProgress = {
  currentLevelPoints: number
  nextLevelPoints: number
  neededForNextLevel: number
  progressPercent: number
}

export function getLevelFromXp(totalPoints: number): number {
  if (!Number.isFinite(totalPoints) || totalPoints < 0) {
    return 1
  }
  const increment = resolveLevelBaseIncrement()
  return Math.floor(Math.max(0, totalPoints) / increment) + 1
}

export function getGamificationLevelProgress(
  currentLevel: number,
  totalPoints: number,
): LevelProgress {
  const safeLevel = Math.max(1, Math.floor(currentLevel))
  const increment = resolveLevelBaseIncrement()
  const currentLevelThreshold = getThresholdForLevel(safeLevel, increment)
  const nextLevelThreshold = getThresholdForLevel(safeLevel + 1, increment)

  const currentLevelPoints = Math.max(0, totalPoints - currentLevelThreshold)
  const levelWindow = Math.max(1, nextLevelThreshold - currentLevelThreshold)
  const progressPercent = Math.min(
    100,
    Math.max(0, (currentLevelPoints / levelWindow) * 100),
  )

  return {
    currentLevelPoints,
    nextLevelPoints: nextLevelThreshold,
    neededForNextLevel: levelWindow,
    progressPercent: Math.round(progressPercent),
  }
}
