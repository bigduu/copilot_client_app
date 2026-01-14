import {
  getMermaidEnhancementPrompt,
  isMermaidEnhancementEnabled,
} from './mermaidUtils'
import {
  getTodoEnhancementPrompt,
  isTodoEnhancementEnabled,
} from './todoEnhancementUtils'

const SYSTEM_PROMPT_ENHANCEMENT_KEY = 'copilot_system_prompt_enhancement'

const joinPromptSegments = (segments: string[]): string => {
  const normalized = segments
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
  return normalized.join('\n\n')
}

export const getSystemPromptEnhancement = (): string => {
  try {
    const stored = localStorage.getItem(SYSTEM_PROMPT_ENHANCEMENT_KEY)
    return stored ?? ''
  } catch (error) {
    console.error('Failed to load system prompt enhancement:', error)
    return ''
  }
}

export const setSystemPromptEnhancement = (value: string): void => {
  try {
    const normalized = value.trim() ? value : ''
    localStorage.setItem(SYSTEM_PROMPT_ENHANCEMENT_KEY, normalized)
  } catch (error) {
    console.error('Failed to save system prompt enhancement:', error)
  }
}

export const getSystemPromptEnhancementPipeline = (): string[] => {
  const pipeline: string[] = []
  const userEnhancement = getSystemPromptEnhancement().trim()

  if (userEnhancement) {
    pipeline.push(userEnhancement)
  }

  if (isMermaidEnhancementEnabled()) {
    pipeline.push(getMermaidEnhancementPrompt().trim())
  }

  if (isTodoEnhancementEnabled()) {
    pipeline.push(getTodoEnhancementPrompt().trim())
  }

  return pipeline
}

export const getSystemPromptEnhancementText = (): string => {
  return joinPromptSegments(getSystemPromptEnhancementPipeline())
}

export const buildEnhancedSystemPrompt = (
  basePrompt: string,
  enhancement?: string,
): string => {
  const base = (basePrompt ?? '').trimEnd()
  const extra = (enhancement ?? '').trim()

  if (!extra) {
    return base
  }
  if (!base) {
    return extra
  }
  return `${base}\n\n${extra}`
}

export const getEffectiveSystemPrompt = (basePrompt: string): string => {
  return buildEnhancedSystemPrompt(basePrompt, getSystemPromptEnhancementText())
}
