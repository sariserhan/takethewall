# Country geometry

`countries-110m.json` is derived from Natural Earth 1:110m Admin 0 Countries:
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson

Public-domain terms: https://www.naturalearthdata.com/about/terms-of-use/

Properties reduced to country name and two-letter code; coordinates rounded to three decimals. Downloaded 2026-09-13. Borders are illustrative, not a statement about disputed boundaries.

## Radar city centers

`cities-15000.json` is a reduced GeoNames cities15000 and admin1CodesASCII extract,
downloaded 2026-09-14. Rebuild with `python3 scripts/build-radar-cities.py`. Rows
contain country code, city name, ASCII name, admin name, ASCII admin name, admin
code, longitude and latitude. Coordinates are rounded to two decimals and identify
city centers, never visitor coordinates. Ambiguous city/country matches are not
guessed. The admin names are public gazetteer data, not webhook region fields.

Source: https://download.geonames.org/export/dump/
License: Creative Commons Attribution, https://www.geonames.org/export/
Credit to GeoNames is available in Radar’s expandable Map credits section.
