const WEATHER_CACHE_KEY = "testbox-weather-cache";
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

const WMO_ICONS = {
  0: "☀️",      // Clear sky
  1: "🌤️",     // Mainly clear
  2: "⛅",      // Partly cloudy
  3: "☁️",      // Overcast
  45: "🌫️",    // Fog
  48: "🌫️",    // Depositing rime fog
  51: "🌦️",    // Light drizzle
  53: "🌦️",    // Moderate drizzle
  55: "🌧️",    // Dense drizzle
  61: "🌧️",    // Slight rain
  63: "🌧️",    // Moderate rain
  65: "🌧️",    // Heavy rain
  71: "🌨️",    // Slight snow
  73: "🌨️",    // Moderate snow
  75: "❄️",     // Heavy snow
  80: "🌦️",    // Slight rain showers
  81: "🌧️",    // Moderate rain showers
  82: "⛈️",     // Violent rain showers
  85: "🌨️",    // Slight snow showers
  86: "❄️",     // Heavy snow showers
  95: "⛈️",     // Thunderstorm
  96: "⛈️",     // Thunderstorm with hail
  99: "⛈️",     // Thunderstorm with heavy hail
};

export function getWeatherIcon(code, isDay) {
  if (!isDay && code === 0) return "🌙";
  return WMO_ICONS[code] || "🌡️";
}

export async function searchCities(query, language = "en") {
  if (!query || query.trim().length < 2) return [];

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=6&language=${language}&format=json`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const json = await response.json();
    return (json.results || []).map((r) => ({
      name: r.name,
      country: r.country || "",
      admin1: r.admin1 || "",
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  } catch {
    // Network/parse failure — caller treats empty result with error state
    return [];
  }
}

export async function fetchWeather(lat, lon) {
  // Check cache first
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || "null");
    if (cached && cached.lat === lat && cached.lon === lon && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }
  } catch {
    // corrupted cache — fetch fresh
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;

  const response = await fetch(url);
  if (!response.ok) throw new Error("Weather fetch failed");

  const json = await response.json();
  const current = json.current;

  const data = {
    temperature: Math.round(current.temperature_2m),
    weatherCode: current.weather_code,
    isDay: current.is_day === 1,
  };

  // Cache the result
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({
      lat, lon, data, timestamp: Date.now(),
    }));
  } catch {
    // storage unavailable — skip caching
  }

  return data;
}
