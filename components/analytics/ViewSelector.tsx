'use client'

import { useState, useEffect } from 'react'
import { Bookmark, BookmarkCheck, Plus, Settings } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AnalyticsView, loadViews, saveView, deleteView } from '@/lib/analytics-views'
import { FilterState } from '@/app/(dashboard)/analytics/page'

interface ViewSelectorProps {
  currentViewId?: string
  onViewChange: (view: AnalyticsView) => void
  currentFilters: FilterState
  currentLayout?: AnalyticsView['layout']
  onSaveView?: (view: AnalyticsView) => void
}

export function ViewSelector({
  currentViewId,
  onViewChange,
  currentFilters,
  currentLayout,
  onSaveView
}: ViewSelectorProps) {
  const [views, setViews] = useState<AnalyticsView[]>([])
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false)
  const [saveViewName, setSaveViewName] = useState('')
  const [saveViewDescription, setSaveViewDescription] = useState('')

  useEffect(() => {
    setViews(loadViews())
  }, [])

  const handleSaveView = () => {
    if (!saveViewName.trim()) {
      return
    }

    // Filter out empty/default values to only save active filters
    const activeFilters: Partial<FilterState> = {}
    Object.entries(currentFilters).forEach(([key, value]) => {
      if (value && value !== '' && value !== 'all') {
        activeFilters[key as keyof FilterState] = value
      }
    })

    const newView = saveView({
      name: saveViewName.trim(),
      description: saveViewDescription.trim() || undefined,
      filters: activeFilters,
      layout: currentLayout
    })

    setViews(loadViews())
    setIsSaveDialogOpen(false)
    setSaveViewName('')
    setSaveViewDescription('')
    onSaveView?.(newView)
  }

  const handleDeleteView = (viewId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this view?')) {
      deleteView(viewId)
      setViews(loadViews())
      if (currentViewId === viewId) {
        // Switch to overview if deleting current view
        const overview = views.find(v => v.id === 'overview')
        if (overview) {
          onViewChange(overview)
        }
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentViewId || 'overview'}
        onValueChange={(value) => {
          const view = views.find(v => v.id === value)
          if (view) {
            onViewChange(view)
          }
        }}
      >
        <SelectTrigger className="w-[240px]">
          <SelectValue placeholder="Select a view" />
        </SelectTrigger>
        <SelectContent>
          {views.map((view) => (
            <SelectItem key={view.id} value={view.id}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2 flex-1">
                  {view.isPreset ? (
                    <BookmarkCheck className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Bookmark className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{view.name}</div>
                    {view.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {view.description}
                      </div>
                    )}
                  </div>
                </div>
                {!view.isPreset && (
                  <button
                    onClick={(e) => handleDeleteView(view.id, e)}
                    className="ml-2 text-destructive hover:text-destructive/80"
                    aria-label="Delete view"
                  >
                    ×
                  </button>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Save View
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Current View</DialogTitle>
            <DialogDescription>
              Save your current filters and layout as a named view for quick access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View Name</Label>
              <Input
                id="view-name"
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                placeholder="e.g., Friday DM Sets"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="view-description">Description (optional)</Label>
              <Textarea
                id="view-description"
                value={saveViewDescription}
                onChange={(e) => setSaveViewDescription(e.target.value)}
                placeholder="Brief description of what this view shows"
                rows={3}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">Current filters:</p>
              <ul className="list-disc list-inside space-y-1">
                {Object.keys(currentFilters).length === 0 ? (
                  <li className="text-muted-foreground/70">No filters applied</li>
                ) : (
                  Object.entries(currentFilters).map(([key, value]) => (
                    <li key={key}>
                      {key}: {Array.isArray(value) ? value.join(', ') : String(value)}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveView} disabled={!saveViewName.trim()}>
              Save View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

