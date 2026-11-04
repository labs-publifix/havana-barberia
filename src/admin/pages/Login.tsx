import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, FlaskConical } from 'lucide-react'
import { routes } from '@/app/routes'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { TextField } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { useAdminAuth } from '../auth/AdminAuth'
import { useReturnTo } from '../auth/useReturnTo'
import { InvalidCredentialsError } from '../data/AdminRepository'
import { isSessionComplete, roleLabels, roleSummaries, type AdminSession } from '../domain'
import { AuthLayout } from './AuthLayout'

const schema = z.object({
  email: z.string().trim().min(1, 'Escribe tu correo.').email('Revisa el formato del correo.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
})
type Values = z.infer<typeof schema>

export default function Login() {
  useDocumentTitle('Entrar al panel', { noindex: true })
  const { session, signIn, switchTo, repo } = useAdminAuth()
  const navigate = useNavigate()
  const returnTo = useReturnTo()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [forgot, setForgot] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  const go = (s: AdminSession) =>
    navigate(isSessionComplete(s) ? returnTo : routes.adminVerify, { replace: true, state: { from: returnTo } })

  if (isSessionComplete(session)) return <Navigate to={returnTo} replace />

  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    try {
      go(await signIn(v.email, v.password))
    } catch (e) {
      setError(e instanceof InvalidCredentialsError ? e.message : 'No pudimos entrar. Intenta de nuevo.')
    }
  })

  /** Demo: enter as a role through the real flow (second step included for owner and manager). */
  const enterAs = async (userId: string) => {
    const u = repo.demo?.users.find((x) => x.id === userId)
    if (!u || !repo.demo) return
    setError(null)
    const s = u.mfaRequired ? await signIn(u.email, repo.demo.password) : await switchTo!(u.id)
    go(s)
  }

  return (
    <AuthLayout>
      <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">Entra al panel</h1>
      <p className="mt-2 text-fg-muted">Usa el correo y la contraseña de tu invitación.</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 grid gap-5">
        {error && <Alert tone="danger" title={error} />}
        <TextField
          label="Correo"
          type="email"
          autoComplete="username"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <div className="relative">
          <TextField
            label="Contraseña"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            error={errors.password?.message}
            className="pr-14"
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={showPassword}
            className="absolute right-1 top-[26px] grid size-tap place-items-center rounded-full text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            {showPassword ? (
              <EyeOff className="size-5" strokeWidth={1.75} />
            ) : (
              <Eye className="size-5" strokeWidth={1.75} />
            )}
          </button>
        </div>

        <button type="submit" disabled={isSubmitting} className={buttonClass({ size: 'lg', block: true })}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
          {!isSubmitting && <ArrowRight className="size-5" strokeWidth={1.75} aria-hidden />}
        </button>

        <div>
          <button
            type="button"
            onClick={() => setForgot((v) => !v)}
            aria-expanded={forgot}
            className="rounded text-sm font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            ¿Olvidaste tu contraseña?
          </button>
          {forgot && (
            <p className="mt-2 text-sm text-fg-muted">
              Te enviaremos un enlace a tu correo para crear una nueva. Se activa al conectar el correo del panel;
              mientras tanto, pide a la persona dueña que te reenvíe la invitación.
            </p>
          )}
        </div>
      </form>

      {repo.demo && (
        <section aria-labelledby="demo-title" className="mt-10 rounded-lg border border-dashed border-line-strong p-4">
          <h2 id="demo-title" className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="size-4" strokeWidth={1.75} aria-hidden />
            Modo demostración
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-fg-muted">
            Datos ficticios. Entra con un rol para revisar qué ve cada persona.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {repo.demo.users
              .filter((u, i, all) => all.findIndex((x) => x.role === u.role) === i)
              .map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => void enterAs(u.id)}
                    className={cn(
                      'grid min-h-[56px] w-full content-center rounded-md border border-line bg-raised px-3 py-2 text-left',
                      'transition-colors duration-fast hover:border-fg',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    )}
                  >
                    <span className="text-sm font-semibold">{roleLabels[u.role]}</span>
                    <span className="text-xs text-fg-muted">{roleSummaries[u.role]}</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </AuthLayout>
  )
}
