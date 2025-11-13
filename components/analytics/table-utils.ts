import { useEffect, useMemo, useState } from 'react'

export type SortDirection = 'asc' | 'desc'

export interface TableColumn<T> {
  key: keyof T
  label: string
  numeric?: boolean
  format?: (value: any, row: T) => string
  sortAccessor?: (row: T) => string | number
  searchAccessor?: (row: T) => string
}

export interface UseTableStateOptions<T> {
  data: T[]
  columns: TableColumn<T>[]
  getId: (row: T) => string
  defaultSort?: { key: keyof T; direction?: SortDirection }
  searchAccessor?: (row: T) => string
  pageSizeOptions?: number[]
}

export interface TableState<T> {
  displayedRows: T[]
  allRows: T[]
  selectedRows: T[]
  selectedIds: Set<string>
  toggleSelect: (id: string) => void
  setSelection: (ids: string[], selected: boolean) => void
  isSelected: (id: string) => boolean
  clearSelection: () => void
  toggleSort: (key: keyof T) => void
  sortKey: keyof T | null
  sortDirection: SortDirection
  searchTerm: string
  setSearchTerm: (value: string) => void
  page: number
  setPage: (value: number) => void
  pageSize: number
  setPageSize: (value: number) => void
  totalPages: number
  exportCsv: (filename: string) => void
  pageSizeOptions: number[]
  getId: (row: T) => string
}

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100]

export function useTableState<T>({
  data,
  columns,
  getId,
  defaultSort,
  searchAccessor,
  pageSizeOptions = DEFAULT_PAGE_SIZES
}: UseTableStateOptions<T>): TableState<T> {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<keyof T | null>(defaultSort?.key ?? null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSort?.direction ?? 'desc')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(pageSizeOptions[0])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setPage(0)
    setSelectedIds(new Set())
  }, [data])

  const filteredAndSorted = useMemo(() => {
    let rows = [...data]

    const searchFn =
      searchAccessor ||
      columns.find((col) => col.searchAccessor)?.searchAccessor ||
      ((row: T) => {
        const firstColumn = columns[0]
        const value = row[firstColumn.key]
        return typeof value === 'string' ? value : ''
      })

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase()
      rows = rows.filter((row) => searchFn(row)?.toLowerCase().includes(term))
    }

    if (sortKey) {
      const accessor =
        columns.find((column) => column.key === sortKey)?.sortAccessor ||
        ((row: T) => row[sortKey] as unknown as string | number | null)

      rows = rows.sort((a, b) => {
        const valueA = accessor(a)
        const valueB = accessor(b)

        if (valueA === valueB) return 0
        if (valueA === null || valueA === undefined) return sortDirection === 'asc' ? -1 : 1
        if (valueB === null || valueB === undefined) return sortDirection === 'asc' ? 1 : -1

        if (typeof valueA === 'number' && typeof valueB === 'number') {
          return sortDirection === 'asc' ? valueA - valueB : valueB - valueA
        }

        return sortDirection === 'asc'
          ? String(valueA).localeCompare(String(valueB))
          : String(valueB).localeCompare(String(valueA))
      })
    }

    return rows
  }, [columns, data, searchAccessor, searchTerm, sortDirection, sortKey])

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize))
  const currentPage = Math.min(page, totalPages - 1)

  const displayedRows = useMemo(() => {
    const start = currentPage * pageSize
    return filteredAndSorted.slice(start, start + pageSize)
  }, [filteredAndSorted, currentPage, pageSize])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const setSelection = (ids: string[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => {
        if (selected) {
          next.add(id)
        } else {
          next.delete(id)
        }
      })
      return next
    })
  }

  const isSelected = (id: string) => selectedIds.has(id)

  const clearSelection = () => setSelectedIds(new Set())

  const toggleSort = (key: keyof T) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  const selectedRows = filteredAndSorted.filter((row) => selectedIds.has(getId(row)))

  const exportCsv = (filename: string) => {
    if (!filteredAndSorted.length) return
    const headers = columns.map((column) => column.label)
    const rows = filteredAndSorted.map((row) =>
      columns
        .map((column) => {
          const value = column.format ? column.format(row[column.key], row) : row[column.key]
          const safeValue =
            typeof value === 'string' ? `"${value.replace(/\"/g, '""')}"` : `"${String(value ?? '')}"`
          return safeValue
        })
        .join(',')
    )
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return {
    displayedRows,
    allRows: filteredAndSorted,
    selectedRows,
    selectedIds,
    toggleSelect,
    setSelection,
    isSelected,
    clearSelection,
    toggleSort,
    sortKey,
    sortDirection,
    searchTerm,
    setSearchTerm,
    page: currentPage,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    exportCsv,
    pageSizeOptions,
    getId
  }
}

