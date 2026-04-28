export const GOOGLE_CALENDAR_SCOPE="https://www.googleapis.com/auth/calendar";
export const getGoogleClientId=()=>import.meta.env.VITE_GOOGLE_CLIENT_ID||"";
export const isGoogleCalendarConfigured=()=>Boolean(getGoogleClientId());
