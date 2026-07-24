/**
 * Stage and progression helpers
 */

export const STAGE_SEQUENCE = [
  { id: 0, name: 'Suvoq', uz: 'Suvoq', description: 'Xonani quritish' },
  { id: 1, name: 'Shpaklovka', uz: 'Shpaklovka', description: 'Devarlarni tekislash' },
  { id: 2, name: 'Paint', uz: 'Bo\'yoq/Oboi', description: 'Devarlarni bo\'yash yoki oboi' },
  { id: 3, name: 'Floor', uz: 'Pol', description: 'Polni tayyorlash' },
  { id: 4, name: 'Furniture', uz: 'Mebel', description: 'Mebelni o\'rnatish' },
  { id: 5, name: 'Electrical', uz: 'Elektr', description: 'Elektr tarmoqlarini o\'rnatish' },
  { id: 6, name: 'Lighting', uz: 'Yorug\'lik', description: 'Yorug\'lik manbalari' },
  { id: 7, name: 'Plumbing', uz: 'Santexnika', description: 'Santexnika tizimlari' },
] as const

export type StageId = (typeof STAGE_SEQUENCE)[number]['id']

/**
 * Get stage by ID
 */
export function getStageById(stageId: StageId) {
  return STAGE_SEQUENCE.find((s) => s.id === stageId)
}

/**
 * Get stage progress percentage
 */
export function getProgressPercentage(completedCount: number, totalCount: number = STAGE_SEQUENCE.length): number {
  if (totalCount === 0) return 0
  return Math.round((completedCount / totalCount) * 100)
}

/**
 * Check if stage can be started (all prerequisites met)
 */
export function canStartStage(stageId: StageId, completedStages: Set<number>): boolean {
  // First stage can always be started
  if (stageId === 0) return true

  // Check if all previous stages are completed
  for (let i = 0; i < stageId; i++) {
    if (!completedStages.has(i)) {
      return false
    }
  }

  return true
}

/**
 * Get next incomplete stage
 */
export function getNextIncompleteStage(completedStages: Set<number>): StageId | null {
  for (const stage of STAGE_SEQUENCE) {
    if (!completedStages.has(stage.id)) {
      return stage.id as StageId
    }
  }
  return null
}

/**
 * Get stage status
 */
export type StageStatus = 'locked' | 'ready' | 'in-progress' | 'completed'

export function getStageStatus(
  stageId: StageId,
  completedStages: Set<number>,
  currentStageId?: number
): StageStatus {
  if (completedStages.has(stageId)) {
    return 'completed'
  }

  if (currentStageId === stageId) {
    return 'in-progress'
  }

  if (canStartStage(stageId, completedStages)) {
    return 'ready'
  }

  return 'locked'
}
