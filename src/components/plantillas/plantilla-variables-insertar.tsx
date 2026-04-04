'use client'

import type { Editor } from '@tiptap/core'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { GrupoVariableInsercion } from '@/lib/plantillas/variables-informe-ingreso-ux'
import { ListPlus } from 'lucide-react'

type Props = {
  editor: Editor | null
  grupos: GrupoVariableInsercion[]
}

export function PlantillaVariablesInsertar({ editor, grupos }: Props) {
  if (!editor || grupos.length === 0) return null

  const insertar = (token: string) => {
    const texto = `{{${token}}}`
    editor.chain().focus().insertContent(texto).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-emerald-200/80 bg-emerald-50/60 px-2 py-2">
      <span className="text-xs font-medium text-slate-800">Rellenar con datos del expediente</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="secondary" size="sm" className="gap-1.5 shadow-sm">
            <ListPlus className="h-4 w-4" />
            Elegir dato a insertar
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[min(100vw-2rem,22rem)] max-h-[min(70vh,28rem)] overflow-y-auto"
        >
          {grupos.map((g, gi) => (
            <div key={g.titulo}>
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
                {g.titulo}
              </DropdownMenuLabel>
              {g.items.map((it) => (
                <DropdownMenuItem key={it.token} onSelect={() => insertar(it.token)}>
                  {it.label}
                </DropdownMenuItem>
              ))}
              {gi < grupos.length - 1 ? <DropdownMenuSeparator /> : null}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-xs text-slate-600 max-w-md leading-snug">
        Coloque el cursor donde va el dato (o borre el texto de un ejemplo) y elija el dato aquí. No hace falta escribir
        códigos raros.
      </span>
    </div>
  )
}
