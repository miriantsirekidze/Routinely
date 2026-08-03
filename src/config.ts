// App configuration / secrets. EXPO_PUBLIC_* vars are inlined into the JS bundle at build
// time (see .env). The ORS key is a rate-limited free key — fine to ship in a personal app.
export const ORS_API_KEY: string = process.env.EXPO_PUBLIC_ORS_API_KEY ?? "";
export const hasOrsKey = ORS_API_KEY.length > 0;
