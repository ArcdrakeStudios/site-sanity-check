// One persisted aggregate record, with no visitor, hostname or scan data.
// Quotas survive container/Worker restarts; a failed start still consumes a slot.
export async function admit(storage, time = Date.now()) {
  return storage.transaction(async tx => {
    const day = Math.floor(time / 86400000), minute = Math.floor(time / 60000);
    const prior = await tx.get('admission') ?? {};
    const daily = prior.day === day ? prior.daily : 0;
    const minutely = prior.minute === minute ? prior.minutely : 0;
    if (daily >= 100) return 'daily_capacity';
    if (minutely >= 10) return 'rate_limit';
    await tx.put('admission', { day, minute, daily: daily + 1, minutely: minutely + 1 });
    return null;
  });
}
