import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SystemSettingsKeywordMaskingTab from '../SystemSettingsKeywordMaskingTab'

const mockInvoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

describe('SystemSettingsKeywordMaskingTab', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue({ entries: [] })
  })

  it('applies example selection to pattern and match type', async () => {
    render(<SystemSettingsKeywordMaskingTab />)

    fireEvent.click(await screen.findByText('Add Keyword'))

    const examplesSelect = await screen.findByRole('combobox', {
      name: 'Examples',
    })
    fireEvent.mouseDown(examplesSelect)

    const exampleOption = await screen.findByText('Mask GitHub tokens')
    fireEvent.click(exampleOption)

    await waitFor(() => {
      const input = screen.getByPlaceholderText('Enter pattern to match')
      expect((input as HTMLInputElement).value).toBe('ghp_[A-Za-z0-9]+')
    })
  })
})
