'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface FilterState {
  dateFrom: string
  dateTo: string
  closer: string
  status: string
  dayOfWeek: string
  objectionType: string
  appointmentType: string
  followUpNeeded: string
  nurtureType: string
  minDealSize: string
  maxDealSize: string
  calendar: string
  timeOfDay: string
}

interface AdvancedFiltersProps {
  filters: FilterState
  onFilterChange: (filters: FilterState) => void
  closers?: Array<{ id: string; name: string; email: string }>
  calendars?: string[]
}

export default function AdvancedFilters({ 
  filters, 
  onFilterChange,
  closers = [],
  calendars = []
}: AdvancedFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  const handleChange = (key: keyof FilterState, value: string) => {
    onFilterChange({ ...filters, [key]: value })
  }
  
  const clearFilters = () => {
    onFilterChange({
      dateFrom: '',
      dateTo: '',
      closer: '',
      status: '',
      dayOfWeek: '',
      objectionType: '',
      appointmentType: '',
      followUpNeeded: '',
      nurtureType: '',
      minDealSize: '',
      maxDealSize: '',
      calendar: '',
      timeOfDay: ''
    })
  }
  
  const activeFilterCount = Object.values(filters).filter(v => v !== '').length
  
  return (
    <div className="space-y-4">
      {/* Basic Filters - Always Visible */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div 
          className="cursor-pointer"
          onClick={(e) => {
            const input = (e.currentTarget as HTMLElement).querySelector('input[type="date"]') as HTMLInputElement
            if (input) {
              if (typeof input.showPicker === 'function') {
                input.showPicker()
              } else {
                input.focus()
              }
            }
          }}
        >
          <label className="text-sm font-medium mb-2 block cursor-pointer" htmlFor="dateFrom">
            From Date
          </label>
          <Input
            id="dateFrom"
            type="date"
            value={filters.dateFrom}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              const input = e.currentTarget as HTMLInputElement
              if (typeof input.showPicker === 'function') {
                input.showPicker()
              } else {
                input.focus()
              }
            }}
          />
        </div>
        
        <div 
          className="cursor-pointer"
          onClick={(e) => {
            const input = (e.currentTarget as HTMLElement).querySelector('input[type="date"]') as HTMLInputElement
            if (input) {
              if (typeof input.showPicker === 'function') {
                input.showPicker()
              } else {
                input.focus()
              }
            }
          }}
        >
          <label className="text-sm font-medium mb-2 block cursor-pointer" htmlFor="dateTo">
            To Date
          </label>
          <Input
            id="dateTo"
            type="date"
            value={filters.dateTo}
            onChange={(e) => handleChange('dateTo', e.target.value)}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              const input = e.currentTarget as HTMLInputElement
              if (typeof input.showPicker === 'function') {
                input.showPicker()
              } else {
                input.focus()
              }
            }}
          />
        </div>
        
        <div>
          <label className="text-sm font-medium mb-2 block">Closer</label>
          <select
            value={filters.closer}
            onChange={(e) => handleChange('closer', e.target.value)}
            className="w-full border rounded-md p-2"
          >
            <option value="">All Closers</option>
            {closers.map(closer => (
              <option key={closer.id} value={closer.id}>
                {closer.name}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label className="text-sm font-medium mb-2 block">Status</label>
          <select
            value={filters.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="w-full border rounded-md p-2"
          >
            <option value="">All Statuses</option>
            <option value="signed">Signed</option>
            <option value="showed">Showed</option>
            <option value="no_show">No Show</option>
            <option value="cancelled">Cancelled</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </div>
      </div>
      
      {/* Advanced Filters Toggle */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm"
        >
          {showAdvanced ? '▼' : '▶'} Advanced Filters
          {activeFilterCount > 4 && (
            <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white rounded-full text-xs">
              {activeFilterCount - 4}
            </span>
          )}
        </Button>
        
        {activeFilterCount > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={clearFilters}
            className="text-sm text-red-600 hover:text-red-700"
          >
            Clear All Filters
          </Button>
        )}
      </div>
      
      {/* Advanced Filters - Collapsible */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="text-sm font-medium mb-2 block">Day of Week</label>
            <select
              value={filters.dayOfWeek}
              onChange={(e) => handleChange('dayOfWeek', e.target.value)}
              className="w-full border rounded-md p-2"
            >
              <option value="">All Days</option>
              <option value="0">Sunday</option>
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
            </select>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Time of Day</label>
            <select
              value={filters.timeOfDay}
              onChange={(e) => handleChange('timeOfDay', e.target.value)}
              className="w-full border rounded-md p-2"
            >
              <option value="">All Times</option>
              <option value="morning">Morning (6am-12pm)</option>
              <option value="afternoon">Afternoon (12pm-5pm)</option>
              <option value="evening">Evening (5pm-9pm)</option>
              <option value="night">Night (9pm-6am)</option>
            </select>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Appointment Type</label>
            <select
              value={filters.appointmentType}
              onChange={(e) => handleChange('appointmentType', e.target.value)}
              className="w-full border rounded-md p-2"
            >
              <option value="">All Types</option>
              <option value="first_call">First Call</option>
              <option value="follow_up">Follow Up</option>
            </select>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Calendar</label>
            <select
              value={filters.calendar}
              onChange={(e) => handleChange('calendar', e.target.value)}
              className="w-full border rounded-md p-2"
            >
              <option value="">All Calendars</option>
              {calendars.map(cal => (
                <option key={cal} value={cal}>{cal}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Objection Type</label>
            <select
              value={filters.objectionType}
              onChange={(e) => handleChange('objectionType', e.target.value)}
              className="w-full border rounded-md p-2"
            >
              <option value="">All Objections</option>
              <option value="Price">Price</option>
              <option value="Partner">Partner</option>
              <option value="Timing">Timing</option>
              <option value="Value">Value</option>
              <option value="Cash on hand">Cash on Hand</option>
            </select>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Nurture Type</label>
            <select
              value={filters.nurtureType}
              onChange={(e) => handleChange('nurtureType', e.target.value)}
              className="w-full border rounded-md p-2"
            >
              <option value="">All Nurture Types</option>
              <option value="Redzone">Redzone (Within 7 Days)</option>
              <option value="Short Term">Short Term (7-30 days)</option>
              <option value="Long Term">Long Term (30+ days)</option>
            </select>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Min Deal Size</label>
            <Input
              type="number"
              placeholder="$0"
              value={filters.minDealSize}
              onChange={(e) => handleChange('minDealSize', e.target.value)}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Max Deal Size</label>
            <Input
              type="number"
              placeholder="$10,000"
              value={filters.maxDealSize}
              onChange={(e) => handleChange('maxDealSize', e.target.value)}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Follow-ups Needed</label>
            <select
              value={filters.followUpNeeded}
              onChange={(e) => handleChange('followUpNeeded', e.target.value)}
              className="w-full border rounded-md p-2"
            >
              <option value="">All</option>
              <option value="true">Only Follow-ups Needed</option>
              <option value="false">No Follow-ups</option>
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

