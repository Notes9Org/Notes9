import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { ConnectionStatus } from '@/components/collaboration/connection-status'
import { CollaboratorAvatars } from '@/components/collaboration/collaborator-avatars'
import { CollaboratorInfo } from '@/lib/collaboration/use-collaboration'

afterEach(() => {
  cleanup()
})

describe('ConnectionStatus', () => {
  it('renders green dot for connected status', () => {
    render(<ConnectionStatus status="connected" />)
    const statusEl = screen.getByRole('status')
    const dot = statusEl.querySelector('span')
    expect(dot).toHaveClass('bg-green-500')
    expect(dot).not.toHaveClass('animate-pulse')
  })

  it('renders yellow dot with pulse for connecting status', () => {
    render(<ConnectionStatus status="connecting" />)
    const statusEl = screen.getByRole('status')
    const dot = statusEl.querySelector('span')
    expect(dot).toHaveClass('bg-yellow-500')
    expect(dot).toHaveClass('animate-pulse')
  })

  it('renders red dot for disconnected status', () => {
    render(<ConnectionStatus status="disconnected" />)
    const statusEl = screen.getByRole('status')
    const dot = statusEl.querySelector('span')
    expect(dot).toHaveClass('bg-red-500')
    expect(dot).not.toHaveClass('animate-pulse')
  })

  it('has correct aria-label for connected status', () => {
    render(<ConnectionStatus status="connected" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Collaboration active')
  })

  it('has correct aria-label for connecting status', () => {
    render(<ConnectionStatus status="connecting" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Reconnecting...')
  })

  it('has correct aria-label for disconnected status', () => {
    render(<ConnectionStatus status="disconnected" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Collaboration unavailable')
  })
})

describe('CollaboratorAvatars', () => {
  const makeCollaborator = (id: string, name: string, color: string): CollaboratorInfo => ({
    userId: id,
    name,
    color,
    cursor: null,
  })

  it('renders nothing when collaborators array is empty', () => {
    const { container } = render(<CollaboratorAvatars collaborators={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders correct number of avatars up to maxVisible', () => {
    const collaborators = [
      makeCollaborator('1', 'Alice Smith', '#F44336'),
      makeCollaborator('2', 'Bob Jones', '#2196F3'),
      makeCollaborator('3', 'Charlie Brown', '#4CAF50'),
    ]

    render(<CollaboratorAvatars collaborators={collaborators} maxVisible={5} />)

    const group = screen.getByRole('group', { name: 'Active collaborators' })
    // Each collaborator gets an avatar with their name as aria-label
    expect(within(group).getByLabelText('Alice Smith')).toBeInTheDocument()
    expect(within(group).getByLabelText('Bob Jones')).toBeInTheDocument()
    expect(within(group).getByLabelText('Charlie Brown')).toBeInTheDocument()
    // No overflow indicator - query within the group for text starting with +
    expect(within(group).queryByLabelText(/more collaborator/)).not.toBeInTheDocument()
  })

  it('shows overflow indicator when collaborators exceed maxVisible', () => {
    const collaborators = [
      makeCollaborator('1', 'Alice Smith', '#F44336'),
      makeCollaborator('2', 'Bob Jones', '#2196F3'),
      makeCollaborator('3', 'Charlie Brown', '#4CAF50'),
      makeCollaborator('4', 'Diana Prince', '#FF9800'),
      makeCollaborator('5', 'Eve Wilson', '#9C27B0'),
    ]

    render(<CollaboratorAvatars collaborators={collaborators} maxVisible={3} />)

    const group = screen.getByRole('group', { name: 'Active collaborators' })
    // Only 3 visible avatars
    expect(within(group).getByLabelText('Alice Smith')).toBeInTheDocument()
    expect(within(group).getByLabelText('Bob Jones')).toBeInTheDocument()
    expect(within(group).getByLabelText('Charlie Brown')).toBeInTheDocument()
    // Diana and Eve should not be rendered as avatars
    expect(within(group).queryByLabelText('Diana Prince')).not.toBeInTheDocument()
    expect(within(group).queryByLabelText('Eve Wilson')).not.toBeInTheDocument()
    // Overflow indicator shows +2
    expect(within(group).getByLabelText('2 more collaborators')).toBeInTheDocument()
    expect(within(group).getByLabelText('2 more collaborators')).toHaveTextContent('+2')
  })

  it('shows correct initials for each collaborator', () => {
    const collaborators = [
      makeCollaborator('1', 'Alice Smith', '#F44336'),
      makeCollaborator('2', 'Bob', '#2196F3'),
      makeCollaborator('3', 'Charlie David Brown', '#4CAF50'),
    ]

    render(<CollaboratorAvatars collaborators={collaborators} />)

    const group = screen.getByRole('group', { name: 'Active collaborators' })
    // Two-word name: first + last initials
    expect(within(group).getByLabelText('Alice Smith')).toHaveTextContent('AS')
    // Single-word name: first letter only
    expect(within(group).getByLabelText('Bob')).toHaveTextContent('B')
    // Multi-word name: first + last initials
    expect(within(group).getByLabelText('Charlie David Brown')).toHaveTextContent('CB')
  })

  it('applies correct border color from collaborator color property', () => {
    const collaborators = [
      makeCollaborator('1', 'Alice Smith', '#F44336'),
      makeCollaborator('2', 'Bob Jones', '#2196F3'),
    ]

    render(<CollaboratorAvatars collaborators={collaborators} />)

    const group = screen.getByRole('group', { name: 'Active collaborators' })
    const aliceAvatar = within(group).getByLabelText('Alice Smith')
    expect(aliceAvatar).toHaveStyle({ borderColor: '#F44336' })

    const bobAvatar = within(group).getByLabelText('Bob Jones')
    expect(bobAvatar).toHaveStyle({ borderColor: '#2196F3' })
  })

  it('shows overflow indicator with singular text for one extra collaborator', () => {
    const collaborators = [
      makeCollaborator('1', 'Alice Smith', '#F44336'),
      makeCollaborator('2', 'Bob Jones', '#2196F3'),
    ]

    render(<CollaboratorAvatars collaborators={collaborators} maxVisible={1} />)

    const group = screen.getByRole('group', { name: 'Active collaborators' })
    const overflow = within(group).getByLabelText('1 more collaborator')
    expect(overflow).toBeInTheDocument()
    expect(overflow).toHaveTextContent('+1')
  })

  it('uses default maxVisible of 5', () => {
    const collaborators = Array.from({ length: 7 }, (_, i) =>
      makeCollaborator(`${i}`, `User ${i}`, `#${String(i).padStart(6, '0')}`)
    )

    render(<CollaboratorAvatars collaborators={collaborators} />)

    const group = screen.getByRole('group', { name: 'Active collaborators' })
    // Default maxVisible is 5, so overflow should show +2
    const overflow = within(group).getByLabelText('2 more collaborators')
    expect(overflow).toHaveTextContent('+2')
  })
})
