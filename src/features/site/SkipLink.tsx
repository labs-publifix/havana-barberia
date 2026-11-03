export function SkipLink({ target = 'contenido' }: { target?: string }) {
  return (
    <a
      href={`#${target}`}
      className="fixed left-3 top-3 z-toast -translate-y-24 rounded-full bg-aqua-500 px-5 py-3 font-semibold text-ink-950 shadow-lg transition-transform focus:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      Saltar al contenido
    </a>
  )
}
