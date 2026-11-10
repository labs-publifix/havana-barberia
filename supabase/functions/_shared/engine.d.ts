// Types of engine.js for the site's TypeScript check (Deno runs the bundle untyped).
export { computeSlots, nearestAvailable, staffForServices, totalDuration, isActiveStatus } from '@/lib/availability'
export { addDays, localDate, zonedInstant } from '@/lib/time'
export { normalizeMxPhone } from '@/lib/phone'
export { toPolicy, toService, toStaff } from '@/data/supabase/rows'
