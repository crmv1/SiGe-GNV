"""Evalúa un MobileNetV2 congelado con fotografías bolivianas autorizadas."""
import argparse
import csv
import json
import os
from pathlib import Path

import imagehash
import numpy as np
from PIL import Image, ImageOps
from sklearn.metrics import classification_report, confusion_matrix

from dataset import LABELS, LICENSES, UNKNOWN, read_image


def fingerprints(image):
    return tuple(int(str(imagehash.phash(view)),16) for view in (image,ImageOps.mirror(image)))


def evaluate(args):
    metrics=json.loads((args.run/'metrics.json').read_text(encoding='utf8'))
    if metrics.get('architecture','mobilenetv2')!='mobilenetv2':
        raise ValueError('La evaluación de campo usa el preprocesamiento del MobileNetV2 publicado.')
    labels=metrics['confusion_matrix']['labels']
    if UNKNOWN not in labels:
        raise ValueError('Se requiere un modelo con clase desconocida.')
    splits=json.loads(args.particiones.read_text(encoding='utf8'))
    reference=[row for part in ('train','val','test') for row in splits[part]]
    groups={row['grupo'] for row in reference}
    sources={row['fuente'].rstrip('/') for row in reference}
    os.environ.setdefault('TF_USE_LEGACY_KERAS','1')
    import tensorflow as tf

    hashes=[]
    for row in reference:
        with Image.open(args.particiones.parent/row['path']) as image:
            hashes.extend(fingerprints(image))

    images, truth=[],[]
    with args.manifiesto.open(encoding='utf-8-sig',newline='') as source:
        for line,row in enumerate(csv.DictReader(source),2):
            label=row['modelo']
            if label not in {*LABELS,UNKNOWN}:
                raise ValueError(f'Fila {line}: modelo desconocido para el catálogo. Usa {UNKNOWN} si está fuera del catálogo.')
            if (row.get('pais','').strip().casefold()!='bolivia' or row['revisada']!='si'
                    or row['licencia'] not in LICENSES or not all(row.get(key,'').strip()
                    for key in ('municipio','evidencia','archivo','autor','fuente','grupo'))):
                raise ValueError(f'Fila {line}: faltan revisión, licencia, archivo o procedencia boliviana.')
            src=row['fuente'].rstrip('/')
            if row['grupo'] in groups or src in sources:
                raise ValueError(f'Fila {line}: grupo previo o fuente repetida.')
            image=read_image(row,args.manifiesto.parent)
            fingerprint=fingerprints(image)
            if any((current^previous).bit_count()<=5 for current in fingerprint for previous in hashes):
                raise ValueError(f'Fila {line}: coincidencia perceptual con otra foto.')
            hashes.extend(fingerprint)
            sources.add(src)
            images.append(tf.image.resize(np.asarray(image),(224,224)).numpy()/127.5-1)
            truth.append(labels.index(label if label in labels else UNKNOWN))
    if set(truth)!=set(range(len(labels))):
        raise ValueError('El manifiesto de campo debe cubrir todas las clases del modelo y desconocidos.')

    net=tf.keras.models.load_model(args.run/'vehiculos.h5',compile=False)
    scores=net.predict(np.stack(images),verbose=0)
    predicted=scores.argmax(axis=1)
    ranked=np.sort(scores,axis=1)
    unknown=np.asarray(truth)==labels.index(UNKNOWN)
    accepted=(ranked[:,-1]>=metrics['threshold']) & (
        ranked[:,-1]-ranked[:,-2]>=metrics['margin']) & (predicted!=labels.index(UNKNOWN))
    correct=predicted==np.asarray(truth)
    indices=list(range(len(labels)))
    report=dict(samples=len(truth), accepted=int(accepted.sum()), accepted_correct=int((accepted & correct).sum()),
                coverage=float(accepted.mean()), abstention_rate=float((~accepted).mean()),
                accepted_accuracy=float(correct[accepted].mean()) if accepted.any() else None,
                unknown_samples=int(unknown.sum()), unknown_false_accept_rate=float(accepted[unknown].mean()),
                threshold=metrics['threshold'], margin=metrics['margin'],
                classification=classification_report(truth,predicted,labels=indices,target_names=labels,
                                                     output_dict=True,zero_division=0),
                confusion_matrix=dict(labels=labels,counts=confusion_matrix(truth,predicted,labels=indices).tolist()))
    with args.salida.open('x',encoding='utf8') as output:
        json.dump(report,output,ensure_ascii=False,indent=2)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('run','particiones','manifiesto','salida'):
        parser.add_argument(name,type=Path)
    evaluate(parser.parse_args())
