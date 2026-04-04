'use client'

import { useEffect, useState } from 'react'
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
import { paddingDesdeMmCuatro } from '@/lib/plantillas/margenes-word-editor'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAplicar: (paddingCss: string) => void
  /** Valores iniciales en mm (por defecto 2,5 cm ≈ Word Normal) */
  inicialMm?: { arriba: number; derecha: number; abajo: number; izquierda: number }
}

export function MargenesPersonalizarDialog({
  open,
  onOpenChange,
  onAplicar,
  inicialMm = { arriba: 25.4, derecha: 25.4, abajo: 25.4, izquierda: 25.4 },
}: Props) {
  const [arriba, setArriba] = useState(inicialMm.arriba)
  const [derecha, setDerecha] = useState(inicialMm.derecha)
  const [abajo, setAbajo] = useState(inicialMm.abajo)
  const [izquierda, setIzquierda] = useState(inicialMm.izquierda)

  useEffect(() => {
    if (open) {
      setArriba(inicialMm.arriba)
      setDerecha(inicialMm.derecha)
      setAbajo(inicialMm.abajo)
      setIzquierda(inicialMm.izquierda)
    }
  }, [open, inicialMm.arriba, inicialMm.derecha, inicialMm.abajo, inicialMm.izquierda])

  const aplicar = () => {
    const a = Math.min(80, Math.max(0, arriba))
    const d = Math.min(80, Math.max(0, derecha))
    const b = Math.min(80, Math.max(0, abajo))
    const i = Math.min(80, Math.max(0, izquierda))
    onAplicar(paddingDesdeMmCuatro(a, d, b, i))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Márgenes personalizados</DialogTitle>
          <DialogDescription>
            Como en Word: distancia del borde de la hoja al texto (en milímetros). Máximo 80 mm por lado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="m-sup">Superior (mm)</Label>
            <Input
              id="m-sup"
              type="number"
              step={0.1}
              min={0}
              max={80}
              value={arriba}
              onChange={(e) => setArriba(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="m-inf">Inferior (mm)</Label>
            <Input
              id="m-inf"
              type="number"
              step={0.1}
              min={0}
              max={80}
              value={abajo}
              onChange={(e) => setAbajo(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="m-izq">Izquierdo (mm)</Label>
            <Input
              id="m-izq"
              type="number"
              step={0.1}
              min={0}
              max={80}
              value={izquierda}
              onChange={(e) => setIzquierda(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="m-der">Derecho (mm)</Label>
            <Input
              id="m-der"
              type="number"
              step={0.1}
              min={0}
              max={80}
              value={derecha}
              onChange={(e) => setDerecha(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={aplicar}>
            Aplicar márgenes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
