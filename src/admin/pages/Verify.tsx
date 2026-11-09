import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { routes } from '@/app/routes'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { buttonClass } from '@/components/ui/buttonClass'
import { cn } from '@/lib/cn'
import { useAdminAuth } from '../auth/AdminAuth'
import { useReturnTo } from '../auth/useReturnTo'
import { InvalidMfaCodeError } from '../data/AdminRepository'
import { isSessionComplete } from '../domain'
import { AuthLayout } from './AuthLayout'

/** Second step for owner and manager: 6-digit code from an authenticator app. */
export default function Verify() {
  useDocumentTitle('Verificación en dos pasos', { noindex: true })
  const { session, verifyMfa, signOut, repo } = useAdminAuth()
  const navigate = useNavigate()
  const returnTo = useReturnTo()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // First time (real accounts): set up the authenticator app with a QR code.
  const [setup, setSetup] = useState<{ qrCode: string; secret: string } | null | undefined>(
    repo.mfaEnrollment ? undefined : null,
  )
  const needsStep = !!session && !isSessionComplete(session)
  useEffect(() => {
    if (!needsStep || !repo.mfaEnrollment) return
    let alive = true
    repo
      .mfaEnrollment()
      .then((r) => alive && setSetup(r))
      .catch(() => alive && setSetup(null))
    return () => {
      alive = false
    }
  }, [needsStep, repo])

  if (session === undefined) return null
  if (!session) return <Navigate to={routes.adminLogin} replace />
  if (isSessionComplete(session)) return <Navigate to={returnTo} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      setError('Escribe los 6 dígitos del código.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await verifyMfa(code)
      navigate(returnTo, { replace: true })
    } catch (err) {
      setError(err instanceof InvalidMfaCodeError ? err.message : 'No pudimos verificar el código.')
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <span className="grid size-12 place-items-center rounded-full bg-fg/[0.06]" aria-hidden>
        <ShieldCheck className="size-6" strokeWidth={1.75} />
      </span>
      <h1 className="mt-5 text-[28px] font-semibold leading-tight tracking-[-0.03em]">
        {setup ? 'Activa la verificación en dos pasos' : 'Verificación en dos pasos'}
      </h1>
      {setup === undefined ? (
        <p className="mt-2 text-fg-muted" aria-busy="true">
          Preparando…
        </p>
      ) : setup ? (
        <div className="mt-2 grid gap-4 text-fg-muted">
          <p>
            Tu rol ve las finanzas, así que tu cuenta se protege con un código que cambia cada 30 segundos. Abre Google
            Authenticator, Microsoft Authenticator o 1Password en tu teléfono y escanea este código:
          </p>
          <img
            src={setup.qrCode}
            alt="Código QR para tu app de autenticación"
            width={176}
            height={176}
            className="justify-self-center rounded-lg border border-line bg-white p-2"
          />
          <p className="text-[13px]">
            ¿No puedes escanear? Escribe esta clave en la app:{' '}
            <code className="select-all break-all rounded bg-fg/[0.06] px-1.5 py-0.5 font-mono text-[13px] text-fg">
              {setup.secret}
            </code>
          </p>
          <p>Luego escribe aquí el código de 6 dígitos que te muestra la app.</p>
        </div>
      ) : (
        <p className="mt-2 text-fg-muted">
          Escribe el código de 6 dígitos de tu app de autenticación para{' '}
          <span className="font-medium text-fg">{session.user.email}</span>.
        </p>
      )}

      <form onSubmit={submit} noValidate className="mt-8 grid gap-5">
        <div className="grid gap-1.5">
          <label htmlFor="mfa-code" className="t-label">
            Código
          </label>
          <input
            id="mfa-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            aria-invalid={error ? true : undefined}
            aria-describedby="mfa-msg"
            className={cn(
              'tabular h-14 w-full rounded-md border-[1.5px] bg-raised px-4 text-center text-[28px] font-semibold tracking-[0.4em] text-fg',
              'focus:border-fg focus:outline-none focus:ring-4 focus:ring-aqua-500/30',
              error ? 'border-red-600' : 'border-line-strong',
            )}
          />
          <p id="mfa-msg" className={cn('text-[13px] leading-snug', error ? 'text-fg-danger' : 'text-fg-muted')}>
            {error ??
              (repo.demo
                ? 'En la demostración funciona cualquier código de 6 dígitos.'
                : 'El código cambia cada 30 segundos.')}
          </p>
        </div>
        <button type="submit" disabled={busy} className={buttonClass({ size: 'lg', block: true })}>
          {busy ? 'Verificando…' : setup ? 'Activar y entrar' : 'Verificar y entrar'}
        </button>
        <button
          type="button"
          onClick={() => void signOut().then(() => navigate(routes.adminLogin, { replace: true }))}
          className="justify-self-start rounded text-sm font-medium underline decoration-line-strong underline-offset-4 hover:decoration-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          Entrar con otra cuenta
        </button>
      </form>
    </AuthLayout>
  )
}
