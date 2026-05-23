# wsdot-mcp-server — Idea

MCP server wrapping the WSDOT Traveler Information API — Washington State traffic, mountain pass conditions, ferry schedules/real-time data, travel times, highway alerts, and road weather.

## Why

- Unique data: Puget Sound ferry system (largest in US), Cascade mountain pass conditions, I-5/I-90/SR 520 traffic
- No existing MCP server for state DOT data or ferry systems
- Free access code (email registration)
- Explicitly designed for third-party consumption — WSDOT docs say "designed to provide third parties with a single gateway"
- Target users: WA commuters, travelers, logistics, apps needing traffic/ferry data

## API

- **Traffic API base**: `https://www.wsdot.wa.gov/Traffic/api/`
- **Ferry API base**: `https://www.wsdot.wa.gov/ferries/api/`
- **Auth**: Access code via `?AccessCode={CODE}` query param (free, email registration)
- **Format**: JSON or XML (endpoint suffix: `...AsJson` / `...AsXml`)
- **Traffic endpoints**:
  - Highway alerts (incidents, construction, closures)
  - Highway cameras (JPEG feeds + metadata)
  - Mountain pass conditions (road status, restrictions, weather, traction requirements)
  - Traffic flow (speed/volume sensor data)
  - Travel times (named corridor times, e.g., I-5 Northgate to Lynnwood)
  - Toll rates (current dynamic tolls)
  - Road weather (RWIS sensor data)
  - Border crossings (Canada crossing wait times)
- **Ferry endpoints**:
  - Schedules, routes, terminals, vessels
  - Fares, alerts, service disruptions
  - Real-time vessel positions and sailing status
- **Rate limits**: None documented
- **Docs**: REST help pages at `/REST.svc/Help`, Doxygen-generated, maintained (Feb 2026)

## Scope

- Read-only (traffic and ferry data)
- WA state coverage: highways, ferries, mountain passes
- Real-time + scheduled data
- Camera images: include metadata URLs but note WSDOT copyright on images

## Licensing

- Free, government open data (RCW 43.41A.115 encourages broad access)
- No restrictions on commercial use, redistribution, or proxying found
- Standard warranty disclaimer (as-is, no accuracy guarantees)
- Camera images may carry separate WSDOT copyright — surface metadata/URLs, don't proxy image bytes
