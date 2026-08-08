"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { Card } from "@/components/ui/card"

interface DeviceFiltersProps {
  ipFilter: string
  macFilter: string
  onIpFilterChange: (value: string) => void
  onMacFilterChange: (value: string) => void
  onClearFilters: () => void
}

export function DeviceFilters({
  ipFilter,
  macFilter,
  onIpFilterChange,
  onMacFilterChange,
  onClearFilters,
}: DeviceFiltersProps) {
  const hasActiveFilters = ipFilter.trim() !== "" || macFilter.trim() !== ""

  return (
    <Card className="p-4 bg-slate-900 border-slate-800">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Filter by IP Address</label>
          <Input
            placeholder="e.g., 192.168.1.100"
            value={ipFilter}
            onChange={(e) => onIpFilterChange(e.target.value)}
            className="bg-slate-800 border-slate-700 text-white placeholder-slate-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Filter by MAC Address</label>
          <Input
            placeholder="e.g., 00:1A:2B:3C:4D:5E"
            value={macFilter}
            onChange={(e) => onMacFilterChange(e.target.value)}
            className="bg-slate-800 border-slate-700 text-white placeholder-slate-500"
          />
        </div>

        <div className="flex gap-2">
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClearFilters}
              className="gap-2 bg-transparent text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {hasActiveFilters && (
        <div className="mt-3 text-sm text-slate-400">
          {ipFilter && <span className="inline-block mr-3 px-2 py-1 bg-slate-800 rounded">IP: {ipFilter}</span>}
          {macFilter && <span className="inline-block px-2 py-1 bg-slate-800 rounded">MAC: {macFilter}</span>}
        </div>
      )}
    </Card>
  )
}
