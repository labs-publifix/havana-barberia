import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Pencil, Plus, X } from 'lucide-react'
import type { LocalDate, Service, Slot, StaffChoice } from '@/domain/types'
import { SimpleHeader } from '@/components/layout/SimpleHeader'
import { StepIndicator } from '@/components/booking/StepIndicator'
import { ServiceCard } from '@/components/booking/ServiceCard'
import { StaffPicker } from '@/components/booking/StaffPicker'
import { StickyBar } from '@/components/booking/StickyBar'
import { Avatar, AnyBarberIcon } from '@/components/booking/Avatar'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Checkbox, TextArea, TextField } from '@/components/ui/Field'
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'
import { DateTimeStep, type Conflict } from '@/features/booking/DateTimeStep'
import { contactSchema, type ContactForm } from '@/features/booking/schema'
import { clearContact, loadContact, saveContact } from '@/features/booking/draft'
import { useCatalog, useStaff, keys } from '@/app/queries'
import { useRepository } from '@/app/RepositoryContext'
import { routes } from '@/app/routes'
import { business } from '@/config/business'
import { BookingLimitError, SlotUnavailableError } from '@/data'
import { formatMxPhone, normalizeMxPhone } from '@/lib/phone'
import { capitalize, durationLabel, formatDateLong, formatTime12, localTime, money } from '@/lib/time'

type Step = '1' | '2' | '3' | '4' | 'resumen'
const STEP_LABEL: Record<Step, string> = {
  '1': 'Servicios',
  '2': 'Barbero',
  '3': 'Fecha y hora',
  '4': 'Tus datos',
  resumen: 'Revisa tu cita',
}
const STEP_TITLE: Record<Step, string> = {
  '1': 'Elige tus servicios',
  '2': 'Elige tu barbero',
  '3': 'Elige día y hora',
  '4': 'Tus datos',
  resumen: 'Revisa y confirma',
}

/** Booking wizard. Every choice lives in the URL so the back button walks the steps. */
export default function Booking() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const repo = useRepository()
  const queryClient = useQueryClient()
  const catalog = useCatalog()
  const staffQuery = useStaff()

  const step = (['1', '2', '3', '4', 'resumen'].includes(params.get('paso') ?? '') ? params.get('paso') : '1') as Step
  const serviceIds = useMemo(() => (params.get('servicios') ?? '').split(',').filter(Boolean), [params])
  const staffId = (params.get('barbero') || null) as StaffChoice | null
  const date = params.get('fecha') as LocalDate | null
  const slotStartsAt = params.get('hora')

  const services: Service[] = useMemo(
    () =>
      serviceIds.map((id) => catalog.data?.services.find((s) => s.id === id)).filter((s): s is Service => Boolean(s)),
    [serviceIds, catalog.data],
  )
  const staff = staffQuery.data ?? []
  const total = services.reduce((t, s) => t + s.price, 0)
  const duration = services.reduce((t, s) => t + s.durationMin, 0)

  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [assignedStaffId, setAssignedStaffId] = useState<string | null>(null)
  const [showCatalog, setShowCatalog] = useState(serviceIds.length === 0)

  /** Update query params. `push` creates a history entry (step changes). */
  const update = useCallback(
    (patch: Record<string, string | null>, push = false) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k)
            else next.set(k, v)
          }
          return next
        },
        { replace: !push },
      )
    },
    [setParams],
  )
  const goTo = (s: Step) => update({ paso: s }, true)

  // Guard: never show a step whose prerequisites are missing (deep links, reloads).
  const ready = catalog.isSuccess && staffQuery.isSuccess
  useEffect(() => {
    if (!ready) return
    const missing: Step | null =
      step !== '1' && services.length === 0
        ? '1'
        : ['3', '4', 'resumen'].includes(step) && !staffId
          ? '2'
          : ['4', 'resumen'].includes(step) && !slotStartsAt
            ? '3'
            : null
    if (missing) update({ paso: missing })
  }, [ready, step, services.length, staffId, slotStartsAt, update])

  // Drop ids that no longer exist in the catalog.
  useEffect(() => {
    if (catalog.data && services.length !== serviceIds.length)
      update({ servicios: services.map((s) => s.id).join(',') })
  }, [catalog.data, services, serviceIds.length, update])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  const toggleService = (id: string) => {
    const next = serviceIds.includes(id) ? serviceIds.filter((x) => x !== id) : [...serviceIds, id]
    update({ servicios: next.join(','), hora: null })
    setConflict(null)
  }

  const onDateChange = useCallback(
    (d: LocalDate) => {
      update({ fecha: d, hora: null })
    },
    [update],
  )
  const onSlotChange = useCallback(
    (s: Slot | null) => {
      update({ hora: s?.startsAt ?? null })
      setAssignedStaffId(s?.staffId ?? null)
      if (s) setConflict(null)
    },
    [update],
  )

  // Contact form: restored from the session draft, saved on every change.
  const form = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: loadContact(),
    mode: 'onTouched',
  })
  useEffect(() => {
    const sub = form.watch((v) => saveContact(v as ContactForm))
    return () => sub.unsubscribe()
  }, [form])

  const inFlight = useRef(false)
  async function confirm() {
    if (inFlight.current) return // ignore double taps
    const contact = form.getValues()
    const parsed = contactSchema.safeParse(contact)
    if (!parsed.success || !staffId || !slotStartsAt) {
      goTo('4')
      return
    }
    inFlight.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const appt = await repo.createAppointment({
        serviceIds,
        staffId,
        startsAt: slotStartsAt,
        customer: { name: contact.name, phone: normalizeMxPhone(contact.phone)!, email: contact.email },
        notes: contact.notes,
        privacyAccepted: true,
      })
      clearContact()
      queryClient.setQueryData(keys.appointment(appt.token), appt)
      await queryClient.invalidateQueries({ queryKey: ['slots'] })
      navigate(routes.confirmation(appt.token), { replace: true })
    } catch (err) {
      if (err instanceof SlotUnavailableError) {
        setConflict({ alternatives: err.alternatives })
        await queryClient.invalidateQueries({ queryKey: ['slots'] })
        update({ paso: '3', hora: null }, true)
      } else if (err instanceof BookingLimitError) {
        setSubmitError(err.message)
      } else {
        setSubmitError('No pudimos guardar tu cita. Revisa tu conexión e inténtalo de nuevo; tus datos siguen aquí.')
      }
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const chosenStaff = staff.find((s) => s.id === (staffId === 'any' ? assignedStaffId : staffId))
  const stepNumber = step === 'resumen' ? 4 : Number(step)

  const onBack = () => {
    if (step === '1') navigate(routes.home)
    else navigate(-1)
  }

  // ---------- Sticky bar ----------
  const canContinue =
    step === '1' ? services.length > 0 : step === '2' ? Boolean(staffId) : step === '3' ? Boolean(slotStartsAt) : true
  const nextStep: Record<Step, Step | null> = { '1': '2', '2': '3', '3': '4', '4': 'resumen', resumen: null }

  const onContinue = async () => {
    if (step === '4') {
      const ok = await form.trigger()
      if (!ok) {
        form.setFocus((Object.keys(form.formState.errors)[0] as keyof ContactForm) ?? 'name')
        return
      }
      goTo('resumen')
      return
    }
    if (step === 'resumen') return confirm()
    const n = nextStep[step]
    if (n) goTo(n)
  }

  const summary = (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-fg-muted">Total</p>
        <p className="tabular truncate text-[13px] text-fg-muted">
          {services.length === 0
            ? 'Elige al menos un servicio'
            : `${services.length} ${services.length === 1 ? 'servicio' : 'servicios'} · ${durationLabel(duration)}`}
        </p>
      </div>
      <p className="t-price">{money(total)}</p>
    </div>
  )

  return (
    <div className="min-h-dvh bg-page">
      <SimpleHeader onBack={onBack} backLabel={step === '1' ? 'Inicio' : 'Atrás'} />
      <main className="mx-auto grid max-w-booking gap-6 px-4 pt-5">
        <div className="grid gap-4">
          <StepIndicator step={stepNumber} label={STEP_LABEL[step]} />
          <h1 className="t-h1" tabIndex={-1}>
            {STEP_TITLE[step]}
          </h1>
        </div>

        {!ready ? (
          <LoadingRegion>
            <div className="grid gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          </LoadingRegion>
        ) : catalog.isError || staffQuery.isError ? (
          <Alert tone="danger" title="No pudimos cargar la información.">
            Revisa tu conexión y recarga la página.
          </Alert>
        ) : step === '1' ? (
          <div className="grid gap-6">
            {services.length > 0 && (
              <section aria-labelledby="mis-servicios" className="grid gap-3">
                <h2 id="mis-servicios" className="t-overline text-fg-muted">
                  Tus servicios
                </h2>
                <ul className="grid gap-2">
                  {services.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 rounded-lg border-[1.5px] border-selected-border bg-selected p-3 pl-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="t-h4">{s.name}</p>
                        <p className="tabular text-sm text-fg-muted">
                          {durationLabel(s.durationMin)} · {money(s.price)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleService(s.id)}
                        aria-label={`Quitar ${s.name}`}
                        className="grid size-tap shrink-0 place-items-center rounded-full hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <X className="size-5" strokeWidth={1.75} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                {!showCatalog && (
                  <Button variant="secondary" onClick={() => setShowCatalog(true)} className="justify-self-start">
                    <Plus className="size-5" strokeWidth={1.75} aria-hidden />
                    Agregar otro servicio
                  </Button>
                )}
              </section>
            )}
            {(showCatalog || services.length === 0) &&
              catalog.data!.categories.map((cat) => {
                const items = catalog.data!.services.filter((s) => s.categoryId === cat.id)
                return (
                  <section key={cat.id} aria-labelledby={`cat-${cat.id}`} className="grid gap-3">
                    <h2 id={`cat-${cat.id}`} className="t-overline text-fg-accent">
                      {cat.name}
                    </h2>
                    {items.map((s) => (
                      <ServiceCard
                        key={s.id}
                        service={s}
                        selected={serviceIds.includes(s.id)}
                        onToggle={() => toggleService(s.id)}
                        actionLabel="Agregar"
                      />
                    ))}
                  </section>
                )
              })}
          </div>
        ) : step === '2' ? (
          <StaffPicker
            staff={staff}
            value={staffId}
            onChange={(v) => {
              update({ barbero: v, hora: null })
              setConflict(null)
            }}
          />
        ) : step === '3' && staffId ? (
          <DateTimeStep
            serviceIds={serviceIds}
            staffId={staffId}
            staff={staff}
            date={date}
            slotStartsAt={slotStartsAt}
            onDateChange={onDateChange}
            onSlotChange={onSlotChange}
            conflict={conflict}
          />
        ) : step === '4' ? (
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              onContinue()
            }}
          >
            <TextField
              label="Nombre"
              autoComplete="name"
              autoCapitalize="words"
              error={form.formState.errors.name?.message}
              {...form.register('name')}
            />
            <TextField
              label="Teléfono celular"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="442 123 4567"
              hint="10 dígitos. Te avisaremos si hay algún cambio."
              error={form.formState.errors.phone?.message}
              {...form.register('phone', {
                onBlur: (e) => {
                  const n = normalizeMxPhone(e.target.value)
                  if (n) form.setValue('phone', formatMxPhone(n))
                },
              })}
            />
            <TextField
              label="Correo electrónico"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="nombre@correo.com"
              hint="Ahí te enviaremos la confirmación."
              error={form.formState.errors.email?.message}
              {...form.register('email')}
            />
            <TextArea
              label="Notas para tu barbero"
              optional
              placeholder="Ej. traigo foto de referencia"
              error={form.formState.errors.notes?.message}
              {...form.register('notes')}
            />
            <Checkbox
              error={form.formState.errors.privacyAccepted?.message}
              label={
                <>
                  Acepto el{' '}
                  <Link to={routes.privacy} target="_blank" className="font-semibold underline underline-offset-4">
                    aviso de privacidad
                  </Link>
                  .
                </>
              }
              {...form.register('privacyAccepted')}
            />
            <button type="submit" hidden aria-hidden tabIndex={-1} />
          </form>
        ) : step === 'resumen' ? (
          <Review
            services={services}
            staffName={chosenStaff?.name ?? (staffId === 'any' ? 'Primero disponible' : '')}
            staffPhoto={chosenStaff?.photoUrl ?? null}
            anyStaff={staffId === 'any' && !chosenStaff}
            slotStartsAt={slotStartsAt!}
            date={date!}
            contact={form.getValues()}
            onEdit={goTo}
            error={submitError}
          />
        ) : null}
      </main>

      <StickyBar summary={summary}>
        <Button size="lg" block disabled={!ready || !canContinue} loading={submitting} onClick={onContinue}>
          {step === 'resumen' ? (
            'Confirmar cita'
          ) : (
            <>
              Continuar <ArrowRight className="size-5" strokeWidth={1.75} aria-hidden />
            </>
          )}
        </Button>
      </StickyBar>
    </div>
  )
}

function Review({
  services,
  staffName,
  staffPhoto,
  anyStaff,
  slotStartsAt,
  date,
  contact,
  onEdit,
  error,
}: {
  services: Service[]
  staffName: string
  staffPhoto: string | null
  anyStaff: boolean
  slotStartsAt: string
  date: LocalDate
  contact: ContactForm
  onEdit: (s: Step) => void
  error: string | null
}) {
  const time = localTime(slotStartsAt, business.hours.timeZone)
  const phone = normalizeMxPhone(contact.phone)
  const Edit = ({ to, what }: { to: Step; what: string }) => (
    <button
      type="button"
      onClick={() => onEdit(to)}
      aria-label={`Cambiar ${what}`}
      className="-mr-2 inline-flex h-tap items-center gap-1 rounded-full px-3 text-sm font-semibold text-fg-accent hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
    >
      <Pencil className="size-4" strokeWidth={1.75} aria-hidden /> Cambiar
    </button>
  )
  const row = 'flex items-start justify-between gap-3 border-b border-line py-4 last:border-b-0'
  return (
    <div className="grid gap-4">
      {error && (
        <Alert tone="danger" title="No se pudo agendar.">
          {error}
        </Alert>
      )}
      <div className="rounded-lg border border-line bg-raised px-4 shadow-sm">
        <div className={row}>
          <div className="min-w-0">
            <p className="t-overline text-fg-muted">Cuándo</p>
            <p className="t-h4 mt-1">{capitalize(formatDateLong(date))}</p>
            <p className="tabular text-fg-muted">{formatTime12(time)}</p>
          </div>
          <Edit to="3" what="día y hora" />
        </div>
        <div className={row}>
          <div className="flex min-w-0 items-center gap-3">
            {anyStaff ? <AnyBarberIcon size={44} /> : <Avatar name={staffName} src={staffPhoto} size={44} />}
            <div>
              <p className="t-overline text-fg-muted">Barbero</p>
              <p className="t-h4 mt-1">{staffName}</p>
            </div>
          </div>
          <Edit to="2" what="barbero" />
        </div>
        <div className={row}>
          <div className="min-w-0 flex-1">
            <p className="t-overline text-fg-muted">Servicios</p>
            <ul className="mt-1 grid gap-1">
              {services.map((s) => (
                <li key={s.id} className="flex justify-between gap-3">
                  <span>{s.name}</span>
                  <span className="tabular text-fg-muted">{money(s.price)}</span>
                </li>
              ))}
            </ul>
          </div>
          <Edit to="1" what="servicios" />
        </div>
        <div className={row}>
          <div className="min-w-0">
            <p className="t-overline text-fg-muted">Tus datos</p>
            <p className="mt-1 font-semibold">{contact.name}</p>
            <p className="tabular text-fg-muted">{phone ? formatMxPhone(phone) : contact.phone}</p>
            <p className="break-all text-fg-muted">{contact.email}</p>
            {contact.notes && <p className="mt-1 text-sm text-fg-muted">“{contact.notes}”</p>}
          </div>
          <Edit to="4" what="tus datos" />
        </div>
      </div>
      <Alert tone="info" title="Antes de confirmar.">
        Puedes cancelar o reprogramar hasta {business.policy.changeCutoffMin / 60} horas antes. Te esperamos con{' '}
        {business.policy.toleranceMin} minutos de tolerancia.
      </Alert>
    </div>
  )
}
