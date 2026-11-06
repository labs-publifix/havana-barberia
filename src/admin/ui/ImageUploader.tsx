import { useId, useRef, useState, type DragEvent } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { buttonClass } from '@/components/ui/buttonClass'
import { cn } from '@/lib/cn'
import { resizeImage, validateImage } from './image'

/**
 * Product photo: drag and drop or choose a file (phones also offer the camera),
 * preview, replace and remove. The photo is shrunk in the browser before
 * `onUpload` stores it and returns its URL.
 */
export function ImageUploader({
  label,
  value,
  onChange,
  onUpload,
  disabled,
}: {
  label: string
  value: string | null
  onChange: (url: string | null) => void
  onUpload: (image: Blob) => Promise<string>
  disabled?: boolean
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const take = async (file: File | undefined) => {
    if (!file || disabled) return
    const problem = validateImage(file)
    if (problem) return setError(problem)
    setError(null)
    setBusy(true)
    try {
      onChange(await onUpload(await resizeImage(file)))
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo subir la foto.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void take(e.dataTransfer.files[0])
  }

  return (
    <div className="grid gap-2">
      <p id={`${id}-label`} className="text-[13px] font-medium">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!disabled) setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={cn(
            'relative grid size-36 shrink-0 place-items-center overflow-hidden rounded-lg border-[1.5px] bg-surface',
            value ? 'border-line' : 'border-dashed border-line-strong',
            over && 'border-ink-950 bg-selected',
          )}
        >
          {value ? (
            <img src={value} alt="Foto del producto" className="h-full w-full object-cover" />
          ) : (
            <span className="grid justify-items-center gap-1.5 px-3 text-center text-xs text-fg-muted">
              <ImagePlus className="size-6" strokeWidth={1.5} aria-hidden />
              Arrastra una foto aquí
            </span>
          )}
          {busy && (
            <span className="absolute inset-0 grid place-items-center bg-raised/80" role="status">
              <Loader2 className="size-6 animate-spin motion-reduce:animate-none" aria-hidden />
              <span className="sr-only">Subiendo foto…</span>
            </span>
          )}
        </div>
        {!disabled && (
          <div className="grid gap-2">
            <input
              ref={input}
              id={id}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="peer sr-only"
              aria-labelledby={`${id}-label`}
              onChange={(e) => void take(e.target.files?.[0])}
            />
            <label
              htmlFor={id}
              className={buttonClass({
                variant: 'secondary',
                size: 'sm',
                // The real input is visually hidden: show its keyboard focus on this label.
                className:
                  'cursor-pointer peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
              })}
            >
              <ImagePlus className="size-4" strokeWidth={1.75} aria-hidden />
              {value ? 'Cambiar foto' : 'Subir foto'}
            </label>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className={buttonClass({ variant: 'ghost', size: 'sm', className: 'text-fg-danger' })}
              >
                <Trash2 className="size-4" strokeWidth={1.75} aria-hidden /> Quitar foto
              </button>
            )}
            <p className="max-w-[220px] text-xs text-fg-muted">JPG, PNG o WebP, hasta 10 MB. Se ajusta a 800 px.</p>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-fg-danger">
          {error}
        </p>
      )}
    </div>
  )
}
