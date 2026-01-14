const TODO_ENHANCEMENT_KEY = 'todo_enhancement_enabled'

export const isTodoEnhancementEnabled = (): boolean => {
  return localStorage.getItem(TODO_ENHANCEMENT_KEY) !== 'false'
}

export const setTodoEnhancementEnabled = (enabled: boolean): void => {
  localStorage.setItem(TODO_ENHANCEMENT_KEY, enabled.toString())
}

export const getTodoEnhancementPrompt = (): string => {
  return `\n\n## Task Checklist Guidelines\n\nWhen the user request involves multiple steps, include a Markdown TODO list to outline the work.\nUse Markdown task list items with \"- [ ]\" checkboxes, and keep each item short.\nOnly include a TODO list for multi-step tasks; skip it for simple, single-step requests.\n`
}
