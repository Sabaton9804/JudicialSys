'use client'

import { useState } from 'react'
import type { Editor } from '@tiptap/core'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const GRID_MAX = 10

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editor: Editor
}

export function InsertarTablaDialog({ open, onOpenChange, editor }: Props) {
  const [hover, setHover] = useState({ c: -1, r: -1 })
  const [conEncabezado, setConEncabezado] = useState(true)
  const [filasManual, setFilasManual] = useState(3)
  const [colsManual, setColsManual] = useState(3)

  const insertar = (rows: number, cols: number) => {
    const r = Math.min(30, Math.max(1, rows))
    const c = Math.min(30, Math.max(1, cols))
    editor.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: conEncabezado }).run()
    onOpenChange(false)
    setHover({ c: -1, r: -1 })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Insertar tabla</DialogTitle>
          <DialogDescription>
            Elija el tamaño en la cuadrícula (como en Word) o escriba filas y columnas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">Pase el ratón y haga clic en el tamaño deseado (máx. {GRID_MAX}×{GRID_MAX} en la cuadrícula).</p>
            <div
              className="inline-grid gap-px p-1 bg-slate-200 rounded border border-slate-300"
              style={{ gridTemplateColumns: `repeat(${GRID_MAX}, minmax(0, 1fr))` }}
              onMouseLeave={() => setHover({ c: -1, r: -1 })}
            >
              {Array.from({ length: GRID_MAX * GRID_MAX }, (_, i) => {
                const c = i % GRID_MAX
                const r = Math.floor(i / GRID_MAX)
                const activo = hover.c >= 0 && c <= hover.c && r <= hover.r
                return (
                  <button
                    key={i}
                    type="button"
                    className={cn(
                      'h-5 w-5 border border-slate-400 transition-colors',
                      activo ? 'bg-emerald-500 border-emerald-600' : 'bg-white hover:bg-slate-100'
                    )}
                    onMouseEnter={() => setHover({ c, r })}
                    onClick={() => insertar(r + 1, c + 1)}
                    aria-label={`Tabla ${r + 1} filas por ${c + 1} columnas`}
                  />
                )
              })}
            </div>
            {hover.c >= 0 && (
              <p className="text-sm font-medium text-slate-800 mt-2">
                {hover.r + 1} × {hover.c + 1} (filas × columnas)
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={conEncabezado}
              onChange={(e) => setConEncabezado(e.target.checked)}
              className="rounded border-slate-300"
            />
            Fila de encabezado (primera fila como título de columnas)
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tbl-filas">Filas (1–30)</Label>
              <Input
                id="tbl-filas"
                type="number"
                min={1}
                max={30}
                value={filasManual}
                onChange={(e) => setFilasManual(Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tbl-cols">Columnas (1–30)</Label>
              <Input
                id="tbl-cols"
                type="number"
                min={1}
                max={30}
                value={colsManual}
                onChange={(e) => setColsManual(Number(e.target.value) || 1)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => insertar(filasManual, colsManual)}>
            Insertar {filasManual} × {colsManual}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
