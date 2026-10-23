import { useCallback, useEffect, useState } from 'react'
import { searchCities, reverseGeocode, fetchWeather } from './api.js'
import { describe, icon, mood } from './weatherCodes.js'

const LS = { loc: 'wx:loc', units: 'wx:units', cache: 'wx:cache:' }
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
const key = l => `${LS.cache}${l.lat.toFixed(2)},${l.lon.toFixed(2)}`
const DEFAULT_LOC = { name: 'London', region: 'United Kingdom', lat: 51.5072, lon: -0.1276 }

function localeUnits() {
  let region = ''
  try { region = new Intl.Locale(navigator.language).maximize().region } catch {}
  return { temp: ['US', 'BS', 'BZ', 'KY', 'PW'].includes(region) ? 'F' : 'C',
           wind: ['US', 'GB', 'LR', 'MM'].includes(region) ? 'mph' : 'kmh' }
}
const conv = (c, u) => Math.round(u === 'F' ? c * 9 / 5 + 32 : c)
const wind = (k, u) => Math.round(u === 'mph' ? k * 0.621371 : k)
const hourLabel = t => new Date(t).toLocaleTimeString([], { hour: 'numeric' })
const dayLabel = (d, i) => i === 0 ? 'Today' : new Date(d + 'T00:00:00Z').toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' })
const ago = ts => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function App() {
  const [loc, setLoc] = useState(() => read(LS.loc, DEFAULT_LOC))
  const [units, setUnits] = useState(() => read(LS.units, localeUnits()))
  const [cached, setCached] = useState(() => read(key(read(LS.loc, DEFAULT_LOC)), null))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('hourly')

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const load = useCallback(async l => {
    setError('')
    const hit = read(key(l), null)
    setCached(hit)
    if (!navigator.onLine) { setError(hit ? '' : 'You are offline and nothing is saved for this place yet.'); return }
    setLoading(true)
    try {
      const data = await fetchWeather(l.lat, l.lon)
      const entry = { data, savedAt: Date.now() }
      write(key(l), entry); setCached(entry)
    } catch (e) {
      setError(`Couldn't refresh the forecast (${e.message}).`)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(loc) }, [loc, load, online])
  useEffect(() => write(LS.units, units), [units])

  const pick = l => { write(LS.loc, l); setLoc(l); setResults(null); setQ(''); setNotice('') }

  async function onSearch(e) {
    e.preventDefault()
    if (!q.trim()) return
    setBusy(true); setNotice('')
    try {
      const r = await searchCities(q.trim())
      setResults(r)
      if (!r.length) setNotice(`No places found for “${q.trim()}”. Check the spelling or try a nearby city.`)
    } catch { setNotice(online ? 'Search is unavailable right now. Try again in a moment.' : 'Search needs a connection. Reconnect and try again.') }
    finally { setBusy(false) }
  }

  function useMyLocation() {
    setNotice('')
    if (!navigator.geolocation) return setNotice('This browser can’t share your location. Search for a city instead.')
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      async p => { pick(await reverseGeocode(p.coords.latitude, p.coords.longitude)); setBusy(false) },
      err => {
        setBusy(false)
        setNotice(err.code === 1 ? 'Location access is blocked. Allow it in your browser’s site settings, or search for a city.'
          : 'Couldn’t determine your location. Search for a city instead.')
      }, { timeout: 10000 })
  }

  const w = cached?.data
  const c = w?.current
  const tu = units.temp, wu = units.wind === 'mph' ? 'mph' : 'km/h'

  return (
    <div className={`app ${c ? mood(c.code, c.day) : 'cloud'}`}>
      <header className="bar">
        <form onSubmit={onSearch} className="search" role="search">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search city" aria-label="Search city" />
          <button disabled={busy}>Search</button>
          <button type="button" className="ghost" onClick={useMyLocation} disabled={busy}>Use my location</button>
        </form>
        <div className="toggles">
          <div className="seg" role="group" aria-label="Temperature unit">
            {['C', 'F'].map(u => <button key={u} aria-pressed={tu === u} onClick={() => setUnits({ ...units, temp: u })}>°{u}</button>)}
          </div>
          <div className="seg" role="group" aria-label="Wind unit">
            {[['kmh', 'km/h'], ['mph', 'mph']].map(([u, l]) => <button key={u} aria-pressed={units.wind === u} onClick={() => setUnits({ ...units, wind: u })}>{l}</button>)}
          </div>
        </div>
      </header>

      {results?.length > 0 && (
        <ul className="results" role="listbox">
          {results.map(r => <li key={`${r.lat}${r.lon}`}><button onClick={() => pick(r)}>{r.name}<span>{r.region}</span></button></li>)}
        </ul>
      )}

      {!online && <p className="banner warn" role="status">You’re offline. {cached ? 'Showing saved data.' : 'Reconnect to load the forecast.'}</p>}
      {notice && <p className="banner warn" role="alert">{notice}</p>}
      {error && <p className="banner err" role="alert">{error} <button onClick={() => load(loc)}>Try again</button></p>}

      {!w && loading && <div className="skeleton" aria-busy="true"><div /><div /><div /></div>}
      {!w && !loading && !error && online && <p className="empty">Search for a city to see its forecast.</p>}

      {w && (
        <main>
          <section className="now">
            <div>
              <h1>{loc.name}</h1>
              <p className="region">{loc.region}</p>
              <p className="temp">{conv(c.temp, tu)}°</p>
              <p className="desc"><span aria-hidden>{icon(c.code, c.day)}</span> {describe(c.code)}</p>
            </div>
            <dl className="stats">
              <div><dt>Feels like</dt><dd>{conv(c.feels, tu)}°</dd></div>
              <div><dt>Wind</dt><dd>{wind(c.wind, units.wind)} {wu}</dd></div>
              <div><dt>Humidity</dt><dd>{c.humidity}%</dd></div>
              <div><dt>Chance of rain</dt><dd>{c.pop ?? 0}%</dd></div>
            </dl>
          </section>

          <p className="stamp">{loading ? 'Updating…' : `Last updated ${ago(cached.savedAt)}`}{!online || error ? ' (saved copy)' : ''}</p>

          <section className="forecast">
            <div className="seg tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'hourly'} aria-pressed={tab === 'hourly'} onClick={() => setTab('hourly')}>Next 24 hours</button>
              <button role="tab" aria-selected={tab === 'daily'} aria-pressed={tab === 'daily'} onClick={() => setTab('daily')}>7 days</button>
            </div>
            {tab === 'hourly' ? (
              <ol className="hours">
                {w.hourly.map((h, i) => (
                  <li key={h.time}>
                    <b>{i === 0 ? 'Now' : hourLabel(h.time)}</b>
                    <span className="ico" title={describe(h.code)}>{icon(h.code, h.day)}</span>
                    <span>{conv(h.temp, tu)}°</span>
                    <small>{h.pop ?? 0}%</small>
                  </li>
                ))}
              </ol>
            ) : (
              <ol className="days">
                {w.daily.map((d, i) => (
                  <li key={d.date}>
                    <b>{dayLabel(d.date, i)}</b>
                    <span className="ico" aria-hidden>{icon(d.code, 1)}</span>
                    <span className="cond">{describe(d.code)}</span>
                    <small>{d.pop ?? 0}%</small>
                    <span className="range"><b>{conv(d.hi, tu)}°</b> <em>{conv(d.lo, tu)}°</em></span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <footer className="footer">
            Weather data by{' '}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a>{' '}
            (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>) ; units converted. Search results by Open-Meteo Geocoding (GeoNames).
            Place names by{' '}
            <a href="https://www.bigdatacloud.com/" target="_blank" rel="noreferrer">BigDataCloud</a>.<br/>
            Privacy notice: BigDataCloud’s free tier works because they see your coordinates alongside your IP address. Your settings are saved in the browser’s local storage.
          </footer>
        </main>
      )}
    </div>
  )
}
