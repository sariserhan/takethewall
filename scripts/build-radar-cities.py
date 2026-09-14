"""Build an offline GeoNames city-center lookup; no visitor data leaves the app."""
import io,json,urllib.request,zipfile
from pathlib import Path
base='https://download.geonames.org/export/dump/'
admin={}
for line in urllib.request.urlopen(base+'admin1CodesASCII.txt',timeout=30).read().decode().splitlines():
 p=line.split('\t');admin[p[0]]=[p[1],p[2]]
z=zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(base+'cities15000.zip',timeout=30).read()))
rows=[]
for line in z.read('cities15000.txt').decode().splitlines():
 p=line.split('\t'); region=admin.get(p[8]+'.'+p[10],['',''])
 rows.append([p[8],p[1],p[2],region[0],region[1],p[10],round(float(p[5]),2),round(float(p[4]),2)])
Path('public/maps/cities-15000.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
print('City centers:',len(rows))
