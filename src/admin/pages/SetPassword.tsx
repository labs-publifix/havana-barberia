import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { routes } from '@/app/routes'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { TextField } from '@/components/ui/Field'
import { useAdminAuth } from '../auth/AdminAuth'
import { AuthLayout } from './AuthLayout'
import { ForgotPassword } from './Login'

/**
 * Where the invitation and "forgot password" e-mails lead: the link signs the
 * person in, and here they choose their password. Then the panel continues
 * (owner and manager set up the second step next).
 */
export default function SetPassword() {
  useDocumentTitle('Crea tu contraseña', { noindex: true })
  const { session, repo } = useAdminAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!repo.setPassword) return <Navigate to={routes.adminLogin} replace />
  if (session === undefined) return null

  if (!session)
    return (
      <AuthLayout>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">Este enlace ya no sirve</h1>
        <p className="mt-2 text-fg-muted">
          Los enlaces de los correos duran una hora y sirven una sola vez. Escribe tu correo y te mandamos uno nuevo
          para crear tu contraseña.
        </p>
        {repo.requestPasswordReset && <ForgotPassword send={repo.requestPasswordReset.bind(repo)} />}
        <a
          href={`${import.meta.env.BASE_URL}admin/entrar`}
          className="mt-6 inline-block rounded text-sm font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          Ya tengo contraseña: entrar
        </a>
      </AuthLayout>
    )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 10) return setError('Usa al menos 10 caracteres.')
    if (password !== again) return setError('Las contraseñas no coinciden.')
    setBusy(true)
    setError(null)
    try {
      await repo.setPassword!(password)
      navigate(routes.adminSection('inicio'), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la contraseña.')
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <span className="grid size-12 place-items-center rounded-full bg-fg/[0.06]" aria-hidden>
        <KeyRound className="size-6" strokeWidth={1.75} />
      </span>
      <h1 className="mt-5 text-[28px] font-semibold leading-tight tracking-[-0.03em]">Crea tu contraseña</h1>
      <p className="mt-2 text-fg-muted">
        Para <span className="font-medium text-fg">{session.user.email}</span>. Usa al menos 10 caracteres; una frase
        fácil de recordar funciona bien.
      </p>
      <form onSubmit={submit} noValidate className="mt-8 grid gap-5">
        {error && <Alert tone="danger" title={error} />}
        <TextField
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label="Escríbela otra vez"
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
        <button type="submit" disabled={busy} className={buttonClass({ size: 'lg', block: true })}>
          {busy ? 'Guardando…' : 'Guardar y entrar'}
        </button>
      </form>
    </AuthLayout>
  )
}
