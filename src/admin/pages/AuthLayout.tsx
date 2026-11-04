import type { ReactNode } from 'react'
import heroSmall from '@/assets/services/servicios-hero-640.webp'
import heroLarge from '@/assets/services/servicios-hero-1280.webp'
import { Logo } from '@/components/Logo'

/**
 * Split screen for sign-in: real shop photo on the left from 1024px (dark),
 * form on the right (light). On phones and tablets only the form.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-raised text-fg lg:grid-cols-[minmax(0,1.15fr)_minmax(520px,1fr)]">
      <aside data-theme="dark" className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <img
          src={heroLarge}
          srcSet={`${heroSmall} 640w, ${heroLarge} 1280w`}
          sizes="55vw"
          alt=""
          width={1280}
          height={720}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[65%_center]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_top,var(--auth-mask-bottom),var(--auth-mask-mid)_55%,var(--auth-mask-top))]"
        />
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <Logo variant="white" priority className="w-[120px]" />
          <div className="max-w-md text-white">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-gray-300">Panel administrativo</p>
            <p className="mt-3 text-[clamp(1.75rem,2.6vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
              La barbería, en una sola pantalla.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-gray-300">
              Agenda, clientes, servicios y equipo para el día a día de Havana Barbería.
            </p>
          </div>
        </div>
      </aside>

      <main id="contenido" className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-[400px]">
          <Logo variant="black" priority className="mb-10 w-[104px] lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  )
}
