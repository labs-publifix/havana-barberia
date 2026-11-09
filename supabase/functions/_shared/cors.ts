// Browsers may call the functions only from the shop's own sites.
const ALLOWED = [
  'https://havanabarberia.com',
  'https://www.havanabarberia.com',
  'https://labs-publifix.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0]!,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export const isAllowedRedirect = (url: string) => ALLOWED.some((o) => url === o || url.startsWith(`${o}/`))
