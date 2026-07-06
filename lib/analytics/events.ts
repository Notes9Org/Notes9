/**
 * lib/analytics/events.ts
 *
 * Central registry of PostHog event names. Import these constants instead of
 * passing raw string literals to recordRumEvent()/captureServer() so names stay
 * consistent and greppable. Existing literals are migrated opportunistically —
 * this is the canonical source for new instrumentation.
 *
 * Property discipline: event properties MUST be opaque ids, counts, enums, or
 * durations — never free text, message content, or PII.
 */

export const AnalyticsEvent = {
  // Literature / paper search
  LITERATURE_SEARCH_STARTED: 'literature_search_started',
  LITERATURE_SEARCH_COMPLETED: 'literature_search_completed',
  LITERATURE_SEARCH_FAILED: 'literature_search_failed',
  LITERATURE_LOAD_MORE: 'literature_load_more',

  // Catalyst chat
  CATALYST_MESSAGE_SENT: 'catalyst_message_sent',
  CATALYST_MESSAGE_COMPLETED: 'catalyst_message_completed',

  // Attachments
  ATTACHMENT_ADDED: 'attachment_added',
  ATTACHMENT_REJECTED: 'attachment_rejected',

  // Free-tier quota limits
  AI_LIMIT_REACHED: 'ai_limit_reached',
  AI_LIMIT_NOTICE_SHOWN: 'ai_limit_notice_shown',

  // Records CRUD / usage
  SAMPLE_CREATED: 'sample_created',
  PROTOCOL_LINKED_TO_EXPERIMENT: 'protocol_linked_to_experiment',
  LAB_NOTE_EXPORTED: 'lab_note_exported',
} as const

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent]
