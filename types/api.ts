/**
 * API response type definitions
 */

export interface ApiError {
  error: string
  status?: number
}

export interface ApiSuccess<T = unknown> {
  success: boolean
  data?: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface ErrorResponse {
  error: string
  details?: string
  code?: string
}

export interface SuccessResponse {
  success: true
  message?: string
}
