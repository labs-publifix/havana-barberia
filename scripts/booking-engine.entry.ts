// Entry for supabase/functions/_shared/engine.js: the same pure booking rules the
// site uses (availability, time zone helpers, phone), bundled for the Edge Functions.
// Regenerate with `npm run engine`; src/test/engine.test.ts checks it is up to date.
export { computeSlots, nearestAvailable, staffForServices, totalDuration, isActiveStatus } from '@/lib/availability'
export { addDays, localDate, zonedInstant } from '@/lib/time'
export { normalizeMxPhone } from '@/lib/phone'
export { toPolicy, toService, toStaff } from '@/data/supabase/rows'
