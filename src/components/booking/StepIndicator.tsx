import { cn } from '@/lib/cn'

export function StepIndicator({ step, total = 4, label }: { step: number; total?: number; label: string }) {
  return (
    <div className="grid gap-2">
      <p className="t-overline text-fg-muted">
        Paso {step} de {total} <span className="sr-only">: {label}</span>
      </p>
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-base',
              i < step ? 'bg-aqua-500' : 'bg-gray-200',
            )}
          />
        ))}
      </div>
    </div>
  )
}
