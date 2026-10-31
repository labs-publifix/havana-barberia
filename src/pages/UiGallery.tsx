import { useState, type ReactNode } from 'react'
import { ArrowRight, CalendarPlus } from 'lucide-react'
import type { Service, Slot, Staff } from '@/domain/types'
import { Alert } from '@/components/ui/Alert'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Button, type ButtonVariant } from '@/components/ui/Button'
import { Checkbox, TextArea, TextField } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { Dialog } from '@/components/ui/Dialog'
import { Logo } from '@/components/Logo'
import { StepIndicator } from '@/components/booking/StepIndicator'
import { ServiceCard } from '@/components/booking/ServiceCard'
import { StaffPicker } from '@/components/booking/StaffPicker'
import { DayStrip } from '@/components/booking/DayStrip'
import { SlotGrid } from '@/components/booking/SlotGrid'
import { LoyaltyCard } from '@/components/booking/LoyaltyCard'
import { useCatalog, useStaff } from '@/app/queries'
import { addDays, money } from '@/lib/time'
import { cn } from '@/lib/cn'

/**
 * Component gallery (/__ui). Dev and preview only (VITE_UI_GALLERY).
 * Every component, variant and state, side by side in light and dark.
 */

const variants: ButtonVariant[] = ['primary', 'accent', 'secondary', 'ghost', 'danger']
const sampleService: Service = {
  id: 's',
  categoryId: 'combos',
  name: 'Corte de cabello y arreglo de barba',
  description: 'Servicio de corte + barba clásico.',
  durationMin: 60,
  price: 500,
  active: true,
  order: 1,
  loyaltyEligible: true,
}
const today = '2026-11-02'
const mkSlot = (time: string, available: boolean): Slot => ({
  time,
  available,
  staffId: available ? 'isaac' : null,
  startsAt: `${today}T${time}`,
  endsAt: `${today}T${time}`,
})
const sampleSlots = ['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '12:00', '16:15', '19:30'].map(
  (t, i) => mkSlot(t, ![2, 6].includes(i)),
)

function Section({ title, children }: { title: string; children: (tone: 'light' | 'dark') => ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="t-h2 px-4 md:px-0">{title}</h2>
      <div className="grid md:grid-cols-2 md:gap-4">
        {(['light', 'dark'] as const).map((tone) => (
          <div
            key={tone}
            data-theme={tone === 'dark' ? 'dark' : undefined}
            className={cn('grid content-start gap-4 bg-page p-4 text-fg md:rounded-xl md:border md:border-line md:p-6')}
          >
            <p className="t-overline text-fg-muted">{tone === 'light' ? 'Claro' : 'Oscuro'}</p>
            {children(tone)}
          </div>
        ))}
      </div>
    </section>
  )
}

export default function UiGallery() {
  const [selected, setSelected] = useState(false)
  const [staffValue, setStaffValue] = useState<string | null>('any')
  const [day, setDay] = useState<string | null>(today)
  const [slot, setSlot] = useState<string | null>(null)
  const [dialog, setDialog] = useState(false)
  const staff = useStaff().data ?? ([] as Staff[])
  const catalog = useCatalog()

  return (
    <main className="mx-auto grid max-w-6xl gap-10 py-8 md:px-6">
      <header className="grid gap-2 px-4 md:px-0">
        <meta name="robots" content="noindex" />
        <p className="t-overline text-fg-accent">Solo desarrollo y vista previa</p>
        <h1 className="t-h1">Galería de componentes</h1>
        <p className="text-fg-muted">Design tokens v2 · {catalog.data?.services.length ?? '…'} servicios en el mock.</p>
      </header>

      <Section title="Logo">
        {(tone) => (
          <div className={cn('rounded-lg p-4', tone === 'light' ? 'bg-white' : 'bg-ink-950')}>
            <Logo tone={tone === 'light' ? 'onLight' : 'onDark'} className="w-[180px]" />
          </div>
        )}
      </Section>

      <Section title="Tipografía">
        {() => (
          <div className="grid gap-2">
            <p className="t-display">Tu corte, a tu hora</p>
            <p className="t-h1">Elige tu barbero</p>
            <p className="t-h2">Servicios disponibles</p>
            <p className="t-h3">Corte de cabello y barba</p>
            <p className="t-h4">Ritual facial</p>
            <p className="t-body">Te enviaremos la confirmación con todos los detalles a tu correo.</p>
            <p className="t-body-sm text-fg-muted">Puedes cancelar o reprogramar hasta 4 horas antes.</p>
            <p className="t-caption text-fg-muted">Duración aproximada: 45 min</p>
            <p className="t-overline">Paso 2 de 4</p>
            <p className="t-price">{money(430)}</p>
          </div>
        )}
      </Section>

      <Section title="Botones">
        {() => (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-3">
              {variants.map((v) => (
                <Button key={v} variant={v}>
                  {v === 'danger'
                    ? 'Cancelar cita'
                    : v === 'accent'
                      ? 'Reservar cita'
                      : v === 'secondary'
                        ? 'Reprogramar'
                        : v === 'ghost'
                          ? 'Volver'
                          : 'Continuar'}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg">Grande · 52 px</Button>
              <Button size="md">Mediano · 44 px</Button>
              <Button size="sm">Pequeño · 36 px</Button>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button disabled>No disponible</Button>
              <Button loading>Confirmar cita</Button>
              <Button variant="secondary">
                <CalendarPlus className="size-5" strokeWidth={1.75} aria-hidden /> Agregar al calendario
              </Button>
            </div>
            <Button size="lg" block>
              Continuar <ArrowRight className="size-5" strokeWidth={1.75} aria-hidden />
            </Button>
          </div>
        )}
      </Section>

      <Section title="Insignias">
        {(tone) => (
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="booked" />
            <StatusBadge status="confirmed" />
            <StatusBadge status="completed" />
            <StatusBadge status="cancelled" />
            <StatusBadge status="no_show" />
            <Badge tone="warning">Pocas horas</Badge>
            {tone === 'dark' && <Badge tone="onDark">Cerrado · abre a las 10:00</Badge>}
          </div>
        )}
      </Section>

      <Section title="Avisos">
        {() => (
          <div className="grid gap-3">
            <Alert tone="success" title="Listo.">
              Tu cita quedó agendada.
            </Alert>
            <Alert tone="info" title="Recordatorio.">
              Puedes cancelar o reprogramar hasta 4 horas antes.
            </Alert>
            <Alert tone="warning" title="Pocos horarios.">
              Quedan 2 espacios este día.
            </Alert>
            <Alert tone="danger" title="Ese horario ya no está disponible.">
              Elige otro; te mostramos los más cercanos.
            </Alert>
          </div>
        )}
      </Section>

      <Section title="Campos">
        {() => (
          <div className="grid gap-4">
            <TextField label="Nombre" defaultValue="Leonardo Gómez" autoComplete="off" />
            <TextField
              label="Teléfono"
              placeholder="442 123 4567"
              hint="Te avisaremos si hay algún cambio."
              inputMode="tel"
            />
            <TextField
              label="Correo electrónico"
              defaultValue="leo@correo"
              error="Revisa el correo: falta el dominio (ej. .com)."
            />
            <TextField label="Deshabilitado" disabled defaultValue="No editable" />
            <TextArea label="Notas para tu barbero" optional placeholder="Ej. traigo foto de referencia" />
            <Checkbox label="Acepto el aviso de privacidad." />
            <Checkbox label="Con error" error="Acepta el aviso de privacidad para continuar." />
          </div>
        )}
      </Section>

      <Section title="Pasos y tarjetas de servicio">
        {(tone) => (
          <div className="grid gap-4">
            <StepIndicator step={2} label="Barbero" />
            <ServiceCard service={sampleService} selected={false} onToggle={() => setSelected((s) => !s)} tone={tone} />
            <ServiceCard
              service={{ ...sampleService, name: 'Corte y arreglo de bigote', price: 430, durationMin: 45 }}
              selected
              onToggle={() => {}}
              tone={tone}
            />
            <ServiceCard
              service={sampleService}
              selected={selected}
              onToggle={() => setSelected((s) => !s)}
              tone={tone}
            />
          </div>
        )}
      </Section>

      <Section title="Barbero, día y hora">
        {() => (
          <div className="grid gap-5">
            <StaffPicker staff={staff} value={staffValue} onChange={setStaffValue} />
            <DayStrip
              today={today}
              value={day}
              onChange={setDay}
              days={Array.from({ length: 10 }, (_, i) => ({ date: addDays(today, i), disabled: i === 6 }))}
            />
            <SlotGrid
              slots={sampleSlots}
              value={slot}
              onChange={(s) => setSlot(s.startsAt)}
              highlight={[sampleSlots[9]!.startsAt]}
            />
          </div>
        )}
      </Section>

      <Section title="Carga, lealtad y diálogo">
        {() => (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            <LoyaltyCard
              card={{
                token: 't',
                customerId: 'c',
                customerFirstName: 'Ana',
                stamps: 6,
                goal: 10,
                rewardExpiresAt: null,
              }}
            />
            <LoyaltyCard
              card={{
                token: 't',
                customerId: 'c',
                customerFirstName: 'Ana',
                stamps: 10,
                goal: 10,
                rewardExpiresAt: '2027-01-30T18:00:00.000Z',
              }}
            />
            <Button variant="secondary" onClick={() => setDialog(true)}>
              Abrir diálogo
            </Button>
          </div>
        )}
      </Section>

      <Dialog
        open={dialog}
        onOpenChange={setDialog}
        title="¿Cancelar tu cita?"
        description="Liberaremos tu horario para alguien más. Puedes volver a reservar cuando quieras."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Mantener cita
            </Button>
            <Button variant="danger" onClick={() => setDialog(false)}>
              Sí, cancelar cita
            </Button>
          </>
        }
      />
    </main>
  )
}
