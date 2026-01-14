import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkflowSelector from '../WorkflowSelector'

const mockListWorkflows = vi.fn()
const mockGetWorkflow = vi.fn()

vi.mock('../../services/WorkflowManagerService', () => ({
  WorkflowManagerService: {
    getInstance: () => ({
      listWorkflows: mockListWorkflows,
      getWorkflow: mockGetWorkflow,
    }),
  },
}))

describe('WorkflowSelector', () => {
  beforeEach(() => {
    mockListWorkflows.mockReset()
    mockGetWorkflow.mockReset()
  })

  it('renders workflow list and filters by search text', async () => {
    mockListWorkflows.mockResolvedValue([
      {
        name: 'review',
        filename: 'review.md',
        size: 120,
        modified_at: '2025-01-01T00:00:00Z',
        source: 'global',
      },
      {
        name: 'plan',
        filename: 'plan.md',
        size: 80,
        modified_at: '2025-01-02T00:00:00Z',
        source: 'global',
      },
    ])

    render(
      <WorkflowSelector
        visible={true}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        searchText="rev"
      />
    )

    expect(await screen.findByText('/review')).toBeTruthy()
    expect(screen.queryByText('/plan')).toBeNull()
  })

  it('fetches workflow content and calls onSelect', async () => {
    mockListWorkflows.mockResolvedValue([
      {
        name: 'review',
        filename: 'review.md',
        size: 120,
        modified_at: '2025-01-01T00:00:00Z',
        source: 'global',
      },
    ])
    mockGetWorkflow.mockResolvedValue({
      name: 'review',
      content: '# Review\n\n1. Check logs.',
    })
    const onSelect = vi.fn()

    render(
      <WorkflowSelector
        visible={true}
        onSelect={onSelect}
        onCancel={vi.fn()}
        searchText=""
      />
    )

    const item = await screen.findByText('/review')
    fireEvent.click(item)

    expect(mockGetWorkflow).toHaveBeenCalledWith('review')
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({
        name: 'review',
        content: '# Review\n\n1. Check logs.',
      })
    })
  })

  it('triggers auto-complete for the selected workflow', async () => {
    mockListWorkflows.mockResolvedValue([
      {
        name: 'review',
        filename: 'review.md',
        size: 120,
        modified_at: '2025-01-01T00:00:00Z',
        source: 'global',
      },
      {
        name: 'plan',
        filename: 'plan.md',
        size: 80,
        modified_at: '2025-01-02T00:00:00Z',
        source: 'global',
      },
    ])
    const onAutoComplete = vi.fn()

    render(
      <WorkflowSelector
        visible={true}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
        onAutoComplete={onAutoComplete}
        searchText=""
      />
    )

    await screen.findByText('/review')
    fireEvent.keyDown(document, { key: 'Tab' })

    expect(onAutoComplete).toHaveBeenCalledWith('review')
  })
})
