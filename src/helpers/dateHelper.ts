/**
 * Calculate the difference in hours and minutes between UTC and local time.
 * @returns {string} - The timezone offset string in the format "HH:MM".
 * @example
 * // Returns "+08:00" if local time is 8 hours ahead of UTC.
 * getTimezoneOffsetString();
 */
export function getTimezoneOffsetString(): string {
  const currentDate = new Date();
  const timezoneOffsetMinutes = currentDate.getTimezoneOffset();

  // Calculate the hours and minutes
  const hours = Math.floor(Math.abs(timezoneOffsetMinutes) / 60);
  const minutes = Math.abs(timezoneOffsetMinutes) % 60;

  // Add a "-" sign if the offset is negative (west of UTC), otherwise use HTML URL encoding value for "+"
  const sign = timezoneOffsetMinutes >= 0 ? "-" : "%2B";

  // Format the result as "HH:MM"
  const formattedTimezoneOffset = `${sign}${hours
    .toString()
    .padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  return formattedTimezoneOffset;
}

// Get the start date and time in UTC format (events are stored in UTC)
export function getISODateString(date: Date): string {
  try {
    const dateUTC = date.toUTCString();
    const dateISOString = new Date(dateUTC).toISOString();
    return dateISOString;
  } catch (e) {
    throw new Error(
      "Failed to convert date to ISO string: " + (e as Error).message
    );
  }
}
