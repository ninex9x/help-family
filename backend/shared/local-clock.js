/** Um único fuso para agenda e confirmações. O relógio do navegador não define registros clínicos. */
export const timeZone = process.env.HELP_FAMILY_TIME_ZONE || 'America/Sao_Paulo';
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export function localClock(now = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    hour: Number(parts.hour),
  };
}
export const localDate = (now = new Date()) => localClock(now).date;
