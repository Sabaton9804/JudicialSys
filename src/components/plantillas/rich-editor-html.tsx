'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditor, EditorContent, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  BackgroundColor,
} from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  ImageIcon,
  Link2,
  List,
  ListOrdered,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Table2,
  Trash2,
  Underline,
  Undo2,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { PlantillaVariablesInsertar } from '@/components/plantillas/plantilla-variables-insertar'
import { PlantillaGoogleFontsLoader } from '@/components/plantillas/plantilla-google-fonts-loader'
import type { GrupoVariableInsercion } from '@/lib/plantillas/variables-informe-ingreso-ux'
import { FUENTES_EDITOR } from '@/lib/plantillas/fuentes-editor-plantilla'
import { MARGENES_PRESETS_WORD } from '@/lib/plantillas/margenes-word-editor'
import { InsertarTablaDialog } from '@/components/plantillas/insertar-tabla-dialog'
import { MargenesPersonalizarDialog } from '@/components/plantillas/margenes-personalizar-dialog'

const SIZES = [
  { label: 'Predeterminado', value: '' },
  { label: '8 pt', value: '8pt' },
  { label: '9 pt', value: '9pt' },
  { label: '10 pt', value: '10pt' },
  { label: '11 pt', value: '11pt' },
  { label: '12 pt', value: '12pt' },
  { label: '14 pt', value: '14pt' },
  { label: '16 pt', value: '16pt' },
  { label: '18 pt', value: '18pt' },
  { label: '24 pt', value: '24pt' },
]

const MARGEN_INICIAL = MARGENES_PRESETS_WORD[0].padding

const plantillaExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      HTMLAttributes: { class: 'text-blue-600 underline' },
    },
  }),
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  BackgroundColor,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Subscript,
  Superscript,
  Image.configure({
    allowBase64: true,
    inline: false,
    HTMLAttributes: { class: 'max-w-full h-auto rounded-sm' },
  }),
  TableKit.configure({
    table: {
      resizable: true,
      HTMLAttributes: { class: 'plantilla-table w-full border-collapse' },
    },
    tableCell: { HTMLAttributes: { class: 'border border-slate-300 px-2 py-1 align-top' } },
    tableHeader: { HTMLAttributes: { class: 'border border-slate-400 bg-slate-100 px-2 py-1 font-semibold align-top' } },
  }),
]

type Props = {
  value: string
  onChange: (html: string) => void
  className?: string
  id?: string
  variableInsercionGrupos?: GrupoVariableInsercion[]
}

function Toolbar({
  editor,
  margenEdicion,
  onMargenChange,
}: {
  editor: Editor
  margenEdicion: string
  onMargenChange: (padding: string) => void
}) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [dialogoTablaAbierto, setDialogoTablaAbierto] = useState(false)
  const [dialogoMargenesAbierto, setDialogoMargenesAbierto] = useState(false)

  const presetMargenActual = useMemo(
    () => MARGENES_PRESETS_WORD.find((p) => p.padding === margenEdicion),
    [margenEdicion]
  )
  const valorSelectMargen = presetMargenActual?.id ?? 'personalizado'

  const ui = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      attrs: ed.getAttributes('textStyle') as {
        color?: string | null
        fontFamily?: string | null
        fontSize?: string | null
        backgroundColor?: string | null
      },
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      strike: ed.isActive('strike'),
      subscript: ed.isActive('subscript'),
      superscript: ed.isActive('superscript'),
      bulletList: ed.isActive('bulletList'),
      orderedList: ed.isActive('orderedList'),
      blockquote: ed.isActive('blockquote'),
      link: ed.isActive('link'),
      alignLeft: ed.isActive({ textAlign: 'left' }),
      alignCenter: ed.isActive({ textAlign: 'center' }),
      alignRight: ed.isActive({ textAlign: 'right' }),
      justify: ed.isActive({ textAlign: 'justify' }),
      h1: ed.isActive('heading', { level: 1 }),
      h2: ed.isActive('heading', { level: 2 }),
      h3: ed.isActive('heading', { level: 3 }),
      enTabla: ed.isActive('table'),
    }),
  })

  if (!ui) return null

  const {
    attrs,
    bold,
    italic,
    underline,
    strike,
    subscript,
    superscript,
    bulletList,
    orderedList,
    blockquote,
    link,
    alignLeft,
    alignCenter,
    alignRight,
    justify,
    h1,
    h2,
    h3,
    enTabla,
  } = ui
  const fontValue = attrs.fontFamily ?? ''
  const sizeValue = attrs.fontSize ?? ''
  const fontSelectValue = FUENTES_EDITOR.some((f) => f.value === fontValue) ? fontValue : ''

  return (
    <>
      <InsertarTablaDialog open={dialogoTablaAbierto} onOpenChange={setDialogoTablaAbierto} editor={editor} />
      <MargenesPersonalizarDialog
        open={dialogoMargenesAbierto}
        onOpenChange={setDialogoMargenesAbierto}
        onAplicar={onMargenChange}
      />
      <div className="border-b border-slate-200 bg-slate-50">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
        <select
          aria-label="Fuente"
          className="h-8 max-w-[min(280px,46vw)] rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-800"
          value={fontSelectValue}
          onChange={(e) => {
            const v = e.target.value
            if (!v) void editor.chain().focus().unsetFontFamily().run()
            else void editor.chain().focus().setFontFamily(v).run()
          }}
        >
          {FUENTES_EDITOR.map((f) => (
            <option key={f.label} value={f.value} style={f.value ? { fontFamily: f.value } : undefined}>
              {f.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Tamaño"
          className="h-8 max-w-[120px] rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-800"
          value={sizeValue}
          onChange={(e) => {
            const v = e.target.value
            if (!v) editor.chain().focus().unsetFontSize().run()
            else editor.chain().focus().setFontSize(v).run()
          }}
        >
          {SIZES.map((s) => (
            <option key={s.label} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <label
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-slate-200 bg-white"
          title="Color de texto"
        >
          <span className="sr-only">Color de texto</span>
          <input
            type="color"
            className="h-6 w-6 cursor-pointer border-0 p-0"
            value={attrs.color && /^#[0-9A-Fa-f]{6}$/.test(attrs.color) ? attrs.color : '#111111'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>

        <label
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-slate-200 bg-white"
          title="Fondo del texto"
        >
          <span className="sr-only">Fondo del texto</span>
          <input
            type="color"
            className="h-6 w-6 cursor-pointer border-0 p-0"
            value={
              attrs.backgroundColor && /^#[0-9A-Fa-f]{6}$/.test(attrs.backgroundColor)
                ? attrs.backgroundColor
                : '#ffff00'
            }
            onChange={(e) => editor.chain().focus().setBackgroundColor(e.target.value).run()}
          />
        </label>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', bold && 'bg-slate-200')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Negrita"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', italic && 'bg-slate-200')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Cursiva"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', underline && 'bg-slate-200')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Subrayado"
        >
          <Underline className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', strike && 'bg-slate-200')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          aria-label="Tachado"
        >
          <Strikethrough className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', subscript && 'bg-slate-200')}
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          aria-label="Subíndice"
        >
          <SubIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', superscript && 'bg-slate-200')}
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          aria-label="Superíndice"
        >
          <SupIcon className="h-4 w-4" />
        </Button>

        <span className="mx-0.5 h-5 w-px bg-slate-200" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', alignLeft && 'bg-slate-200')}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          aria-label="Alinear izquierda"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', alignCenter && 'bg-slate-200')}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          aria-label="Centrar"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', alignRight && 'bg-slate-200')}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          aria-label="Alinear derecha"
        >
          <AlignRight className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', justify && 'bg-slate-200')}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          aria-label="Justificar"
        >
          <AlignJustify className="h-4 w-4" />
        </Button>

        <span className="mx-0.5 h-5 w-px bg-slate-200" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', bulletList && 'bg-slate-200')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Lista con viñetas"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', orderedList && 'bg-slate-200')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Lista numerada"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <span className="mx-0.5 h-5 w-px bg-slate-200" />

        <select
          aria-label="Encabezado"
          className="h-8 max-w-[130px] rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-800"
          value={h1 ? 'h1' : h2 ? 'h2' : h3 ? 'h3' : 'p'}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'p') editor.chain().focus().setParagraph().run()
            else if (v === 'h1') editor.chain().focus().toggleHeading({ level: 1 }).run()
            else if (v === 'h2') editor.chain().focus().toggleHeading({ level: 2 }).run()
            else if (v === 'h3') editor.chain().focus().toggleHeading({ level: 3 }).run()
          }}
        >
          <option value="p">Párrafo</option>
          <option value="h1">Título 1</option>
          <option value="h2">Título 2</option>
          <option value="h3">Título 3</option>
        </select>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', blockquote && 'bg-slate-200')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          aria-label="Cita"
        >
          <span className="text-xs font-serif">&ldquo;</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 p-0', link && 'bg-slate-200')}
          onClick={() => {
            const prev = editor.getAttributes('link').href as string | undefined
            const url = typeof window !== 'undefined' ? window.prompt('Enlace (URL)', prev ?? 'https://') : null
            if (url === null) return
            if (url === '') {
              editor.chain().focus().unsetLink().run()
              return
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
          }}
          aria-label="Enlace"
        >
          <Link2 className="h-4 w-4" />
        </Button>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              const src = reader.result as string
              if (typeof src === 'string') {
                editor.chain().focus().setImage({ src }).run()
              }
            }
            reader.readAsDataURL(file)
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => imageInputRef.current?.click()}
          aria-label="Insertar imagen"
          title="Insertar imagen"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>

        <span className="mx-0.5 h-5 w-px bg-slate-200" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          aria-label="Deshacer"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          aria-label="Rehacer"
        >
          <Redo2 className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          aria-label="Quitar formato"
        >
          <RemoveFormatting className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-slate-200/90 px-2 py-1.5">
        <select
          aria-label="Márgenes del documento"
          className="h-8 max-w-[min(280px,92vw)] rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-800"
          value={valorSelectMargen}
          onChange={(e) => {
            const v = e.target.value
            if (v === '__personalizar__') {
              setDialogoMargenesAbierto(true)
              return
            }
            const preset = MARGENES_PRESETS_WORD.find((p) => p.id === v)
            if (preset) onMargenChange(preset.padding)
          }}
        >
          {MARGENES_PRESETS_WORD.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          {!presetMargenActual && (
            <option value="personalizado">Personalizado (actual)</option>
          )}
          <option value="__personalizar__">Personalizar márgenes…</option>
        </select>

        <span className="text-[10px] text-slate-500 hidden sm:inline max-w-[200px] leading-tight">
          Márgenes del área de edición (mm, como en Word). El PDF del informe puede usar además márgenes de impresión.
        </span>

        <span className="mx-0.5 h-5 w-px bg-slate-200" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2"
          onClick={() => setDialogoTablaAbierto(true)}
          title="Insertar tabla (elegir filas y columnas)"
        >
          <Table2 className="h-4 w-4" />
          <span className="text-xs">Tabla</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={!enTabla}
          onClick={() => editor.chain().focus().addRowBefore().run()}
          title="Insertar fila arriba"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={!enTabla}
          onClick={() => editor.chain().focus().addRowAfter().run()}
          title="Insertar fila abajo"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={!enTabla}
          onClick={() => editor.chain().focus().addColumnBefore().run()}
          title="Insertar columna a la izquierda"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={!enTabla}
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          title="Insertar columna a la derecha"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-red-700 hover:text-red-800"
          disabled={!enTabla}
          onClick={() => editor.chain().focus().deleteTable().run()}
          title="Eliminar tabla"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
    </>
  )
}

export function RichEditorHtml({ value, onChange, className, id, variableInsercionGrupos }: Props) {
  const [margenEdicion, setMargenEdicion] = useState(MARGEN_INICIAL)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: plantillaExtensions,
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          'min-h-[320px] py-2 outline-none text-[15px] leading-relaxed',
          '[&_a]:text-blue-600 [&_a]:underline',
          '[&_ul]:my-2 [&_ol]:my-2 [&_ol]:list-decimal [&_ul]:list-disc [&_li]:ml-6',
          '[&_img]:float-none [&_img]:block [&_img]:mx-auto [&_img]:my-2 [&_img]:max-h-[140px] [&_img]:max-w-[200px] [&_img]:w-auto [&_img]:h-auto [&_img]:object-contain',
          '[&_table]:w-full [&_table]:border-collapse',
          '[&_td]:border [&_td]:border-slate-300',
          '[&_th]:border [&_th]:border-slate-400 [&_th]:bg-slate-50'
        ),
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    const cur = editor.getHTML()
    if (cur === value) return
    editor.commands.setContent(value, { emitUpdate: false })
  }, [value, editor])

  return (
    <div
      id={id}
      className={cn(
        'plantilla-rich-editor rounded-md border border-slate-200 bg-white overflow-hidden',
        className
      )}
    >
      <PlantillaGoogleFontsLoader />
      {!editor ? (
        <div className="min-h-[320px] flex items-center justify-center text-sm text-slate-500 border-b border-slate-200">
          Cargando editor…
        </div>
      ) : (
        <Toolbar
          editor={editor}
          margenEdicion={margenEdicion}
          onMargenChange={setMargenEdicion}
        />
      )}
      <PlantillaVariablesInsertar editor={editor} grupos={variableInsercionGrupos ?? []} />
      <div style={{ padding: margenEdicion }} className="bg-white">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
