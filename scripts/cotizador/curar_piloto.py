"""Aplica la revisión de las hojas del corte 2 y agrega escenas revisadas."""
import csv
import sys
from pathlib import Path

from commons import FIELDS

DROP = {
    'Toyota Corolla': {4,5,10,12,14,26,32,34,57,66,68,70,84,88,90,99,104,114,119,120,121,122,123,125,129,131,134,137,142,145,152,158,163,166,176,182,183,191,195,200,205,207,*range(208,219)},
    'Toyota RAV4': {2,5,6,7,9,14,18,20,22,25,28,30,32,38,47,51,59,63,65,69,73,74,82,84,85,86,98,101,114,120,121,125,129,131,134,135,136,140,141,146,147,149,156,158,161,170,175,179,183,186,189,190,193,198,201,205,211,213,216},
    'Nissan Sentra': {4,7,8,9,10,11,13,14,15,16,19,25,27,34,36,40,44,46,48,54,57,64,66,69,72,75,79,81,83,87,89,91,93,104,105,125,130,133,137,145,148,151,152,157,158,159,166,168,170,171,172,173,174,175,177},
    'Toyota Yaris': {8,13,15,17,18}, 'Hyundai Accent': {2,4,8}, 'Nissan AD': set(),
}

if __name__ == '__main__':
    promote_sentra = '--sentra' in sys.argv
    folder, output, *extras = map(Path,(arg for arg in sys.argv[1:] if arg != '--sentra'))
    with output.open('x',encoding='utf8',newline='') as dest:
        writer=csv.DictWriter(dest,FIELDS,extrasaction='ignore'); writer.writeheader()
        for model, reject in DROP.items():
            with (folder/(model.replace(' ','_')+'.csv')).open(encoding='utf8',newline='') as source:
                for row in csv.DictReader(source):
                    if int(row['n']) in reject:
                        continue
                    row['grupo'] = 'autor:'+row['autor'].casefold().strip()
                    row['angulo'] = 'exterior'
                    row['generacion'] = row['generacion'] or ('Y10' if model=='Nissan AD' else 'ZRE172R')
                    known = {'Toyota Corolla','Toyota RAV4'} | ({'Nissan Sentra'} if promote_sentra else set())
                    row['modelo'] = model if model in known else '__desconocido__'
                    row['revisada'] = 'si'
                    writer.writerow(row)
        for source in extras:
            with source.open(encoding='utf8',newline='') as f:
                for i,row in enumerate(csv.DictReader(f),1):
                    if i > 29 or i in {2,8,10,12,23,29}:
                        continue
                    row.update(grupo='autor:'+row['autor'].casefold().strip(),revisada='si')
                    writer.writerow(row)
