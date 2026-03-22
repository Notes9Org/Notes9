export function isEndDateBeforeStartDate(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return false
  return new Date(endDate) < new Date(startDate)
}

export const DATE_ORDER_ERROR = "End date must be later than or equal to the start date."
