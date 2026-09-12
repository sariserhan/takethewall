export function demoCountError(values: {
  visitorsToday: number;
  totalVisitors: number;
  impressions: number;
  uniqueVisitors: number;
  clicks: number;
}): string | null {
  for (const value of Object.values(values)) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000)
      return "Demo additions must be whole numbers from 0 to 1 billion.";
  }
  if (values.visitorsToday > values.totalVisitors)
    return "Sample totals must be consistent: increase Total visitors to at least Visitors today, or lower Visitors today.";
  if (values.uniqueVisitors > values.impressions)
    return "Sample totals must be consistent: increase Impressions to at least Unique visitors, or lower Unique visitors.";
  if (values.clicks > values.impressions)
    return "Sample totals must be consistent: increase Impressions to at least Clicks, or lower Clicks.";
  return null;
}
