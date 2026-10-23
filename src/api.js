// Open-Meteo: free, no API key. Data is always fetched in metric; units convert client-side.
const GEO = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const REVERSE = 'https://api.bigdatacloud.net/data/reverse-geocode-client'

async function getJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Weather service returned ${res.status}`)
  return res.json()
}

export async function searchCities(q) {
  const d = await getJSON(`${GEO}?name=${encodeURIComponent(q)}&count=5&language=en`)
  return (d.results || []).map(r => ({
    name: r.name, region: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude, lon: r.longitude,
  }))
}

export async function reverseGeocode(lat, lon) {
  try {
    const d = await getJSON(`${REVERSE}?latitude=${lat}&longitude=${lon}&localityLanguage=en`)
    return { name: d.city || d.locality || 'Current location', region: d.countryName || '', lat, lon }
  } catch {
    return { name: 'Current location', region: '', lat, lon }
  }
}

export async function fetchWeather(lat, lon) {
  const p = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'auto', forecast_days: 7,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    wind_speed_unit: 'kmh',
  })
  const d = await getJSON(`${FORECAST}?${p}`)
  // Start the hourly list at the current hour and take 24 entries
  const hourKey = d.current.time.slice(0, 13)
  let start = d.hourly.time.findIndex(t => t.slice(0, 13) >= hourKey)
  if (start < 0) start = 0
  const hourly = d.hourly.time.slice(start, start + 24).map((t, i) => ({
    time: t, temp: d.hourly.temperature_2m[start + i], code: d.hourly.weather_code[start + i],
    pop: d.hourly.precipitation_probability[start + i], day: d.hourly.is_day[start + i],
  }))
  const daily = d.daily.time.map((t, i) => ({
    date: t, code: d.daily.weather_code[i], hi: d.daily.temperature_2m_max[i],
    lo: d.daily.temperature_2m_min[i], pop: d.daily.precipitation_probability_max[i],
  }))
  const c = d.current
  return {
    current: { temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m,
      wind: c.wind_speed_10m, code: c.weather_code, day: c.is_day, pop: hourly[0]?.pop ?? 0 },
    hourly, daily,
  }
}
