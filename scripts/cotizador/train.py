"""Transfer learning, evaluación sobre test y exportación del artefacto web."""
import argparse
import csv
import json
import shutil
import subprocess
import sys
import tempfile
import time
import os
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
os.environ.setdefault('TF_USE_LEGACY_KERAS', '1')
import tensorflow as tf
from sklearn.metrics import ConfusionMatrixDisplay, accuracy_score, classification_report, confusion_matrix

from dataset import LABELS, UNKNOWN


def main(args):
    if not 0 < args.umbral <= 1 or not 0 < args.margen <= 1:
        raise ValueError('El umbral y el margen deben pertenecer a (0,1].')
    tf.keras.utils.set_random_seed(42)
    if sys.version_info >= (3, 12) and tf.__version__.startswith('2.16.'):
        from tf_keras.src import backend
        from tf_keras.src.utils import tf_utils
        import random
        tf_utils.get_random_seed = lambda: (backend._SEED_GENERATOR.generator or random).randint(1, 10**9)
        backend.RandomGenerator._create_seed = lambda self, seed: seed if seed is not None else tf_utils.get_random_seed()
    args.run.mkdir(parents=True, exist_ok=False)
    splits = json.loads((args.dataset/'splits.json').read_text(encoding='utf8'))
    labels = splits.get('labels', LABELS)
    if len(set(labels) - {UNKNOWN}) < 2 or len(labels) != len(set(labels)) or not set(labels) <= {*LABELS, UNKNOWN}:
        raise ValueError('Etiquetas inválidas.')
    for key in ('grupo','path'):
        sets = [{r[key] for r in splits[p]} for p in ('train','val','test')]
        if any(a & b for i,a in enumerate(sets) for b in sets[i+1:]):
            raise ValueError(f'Filtración entre particiones: {key}')

    def read(path, label):
        image = tf.io.decode_jpeg(tf.io.read_file(path), channels=3)
        image = tf.image.resize(image, (224,224))
        if args.arquitectura == 'resnet50':
            return tf.keras.applications.resnet50.preprocess_input(image), label
        if args.arquitectura.startswith('efficientnet'):
            return image, label
        return image / 127.5 - 1, label

    def data(part):
        rows = splits[part]
        if {r['modelo'] for r in rows} != set(labels):
            raise ValueError(f'Partición {part} incompleta.')
        if part == 'train' and args.tope_originales:
            # Subconjuntos anidados, fijos y elegidos solo dentro de entrenamiento.
            import hashlib
            known = {l:sorted((r for r in rows if r['modelo']==l),
                key=lambda r:hashlib.sha256(f"42:{r['path']}".encode()).digest()) for l in labels if l != UNKNOWN}
            if any(len(items)<args.tope_originales for items in known.values()):
                raise ValueError('No hay originales de entrenamiento suficientes para el hito solicitado.')
            rows = [r for r in rows if r['modelo']==UNKNOWN] + [r for items in known.values() for r in items[:args.tope_originales]]
        ds = tf.data.Dataset.from_tensor_slices(([str(args.dataset/r['path']) for r in rows], [labels.index(r['modelo']) for r in rows]))
        if part == 'train':
            ds = ds.shuffle(len(rows), seed=42)
        return ds.map(read, num_parallel_calls=tf.data.AUTOTUNE).batch(32).prefetch(tf.data.AUTOTUNE)

    train, val, test = (data(p) for p in ('train','val','test'))
    factories = {'mobilenetv2':tf.keras.applications.MobileNetV2,
                 'mobilenetv3':tf.keras.applications.MobileNetV3Small,
                 'efficientnetb0':tf.keras.applications.EfficientNetB0,
                 'efficientnetv2b0':tf.keras.applications.EfficientNetV2B0,
                 'resnet50':tf.keras.applications.ResNet50}
    extra = {'include_preprocessing':False} if args.arquitectura == 'mobilenetv3' else {}
    base = factories[args.arquitectura](weights=str(args.weights) if args.weights else 'imagenet',
                                        include_top=False, input_shape=(224,224,3), **extra)
    base.trainable = False
    inputs = tf.keras.Input(shape=(224,224,3))
    # Aumentos solo durante el ajuste; la red exportada comparte pesos sin estas capas.
    pool = tf.keras.layers.GlobalAveragePooling2D()
    head = tf.keras.layers.Dense(len(labels),activation='softmax')
    extractor = tf.keras.Model(inputs,pool(base(inputs,training=False)))
    augment = tf.keras.layers.RandomFlip('horizontal',seed=42)
    def features(ds, augment_train=False):
        xs,ys=[],[]
        for images, batch in ds:
            xs.append(extractor(images, training=False).numpy()); ys.append(batch.numpy())
            if augment_train:
                xs.append(extractor(augment(images,training=True), training=False).numpy()); ys.append(batch.numpy())
        return np.concatenate(xs),np.concatenate(ys)
    start = time.perf_counter()
    tx,ty=features(train, True); vx,vy=features(val)
    head_model=tf.keras.Sequential([tf.keras.Input(shape=(int(extractor.output_shape[-1]),)),head])
    head_model.compile(optimizer='adam',loss='sparse_categorical_crossentropy',metrics=['accuracy'])
    history = head_model.fit(tx,ty,validation_data=(vx,vy),epochs=args.epochs,callbacks=[
        tf.keras.callbacks.ModelCheckpoint(str(args.run/'best-head.weights.h5'), monitor='val_loss', save_best_only=True, save_weights_only=True),
        tf.keras.callbacks.EarlyStopping(monitor='val_loss',patience=4,restore_best_weights=True)]).history
    head_model.load_weights(args.run/'best-head.weights.h5')
    training_seconds = time.perf_counter()-start
    threshold, margin = args.umbral, args.margen
    unknown_index = labels.index(UNKNOWN) if UNKNOWN in labels else -1
    validation_gate = None
    if args.calibrar and unknown_index >= 0:
        vscores=head_model(vx,training=False).numpy()
        vsorted=np.sort(vscores,axis=1)
        vpred=vscores.argmax(axis=1)
        candidates=[]
        for t in np.arange(.65,.991,.01):
            for m in (.15,.25,.35,.45,.55):
                take=(vsorted[:,-1]>=t)&(vsorted[:,-1]-vsorted[:,-2]>=m)&(vpred!=unknown_index)
                if take.any() and take[vy==unknown_index].mean() <= .10 and (vpred[take]==vy[take]).mean() >= .85:
                    candidates.append((int(take.sum()),float(t),m))
        if not candidates:
            raise ValueError('La validación no produjo una regla de aceptación suficientemente precisa.')
        _,threshold,margin=max(candidates)
        take=(vsorted[:,-1]>=threshold)&(vsorted[:,-1]-vsorted[:,-2]>=margin)&(vpred!=unknown_index)
        validation_gate=dict(coverage=float(take.mean()), accuracy=float((vpred[take]==vy[take]).mean()),
                             unknown_false_accept_rate=float(take[vy==unknown_index].mean()))
    inference = tf.keras.Model(base.input, head(pool(base.output)))
    inference.save(args.run/'vehiculos.h5', include_optimizer=False)

    first, _ = next(iter(test))
    inference(first[:1], training=False).numpy()
    truth, scores, latency = [], [], []
    for images, batch_labels in test:
        truth.extend(batch_labels.numpy())
        for img in images:
            start = time.perf_counter()
            scores.append(inference(img[None], training=False).numpy()[0])
            latency.append((time.perf_counter()-start)*1000)
    scores = np.array(scores)
    pred = scores.argmax(axis=1)
    ranked = np.sort(scores,axis=1)
    accepted = (ranked[:,-1] >= threshold) & (ranked[:,-1]-ranked[:,-2] >= margin) & (pred != unknown_index)
    unknown = np.asarray(truth) == unknown_index
    report = {'architecture':args.arquitectura,'validation_gate':validation_gate,
              'training_originals':{l:min(sum(r['modelo']==l for r in splits['train']),args.tope_originales)
                                    if args.tope_originales and l!=UNKNOWN else sum(r['modelo']==l for r in splits['train']) for l in labels},
              'accuracy':accuracy_score(truth,pred), 'samples':len(truth), 'training_seconds':training_seconds,
              'inference_ms_p50':float(np.median(latency)), 'inference_ms_p95':float(np.percentile(latency,95)),
              'threshold':threshold, 'margin':margin, 'coverage':float(accepted.mean()), 'abstention_rate':float((~accepted).mean()),
              'unknown_samples':int(unknown.sum()), 'unknown_false_accept_rate':float(accepted[unknown].mean()) if unknown.any() else None,
              'accepted_accuracy':accuracy_score(np.asarray(truth)[accepted],pred[accepted]) if accepted.any() else None,
              'classification':classification_report(truth,pred,labels=list(range(len(labels))),target_names=labels,output_dict=True,zero_division=0)}
    matrix = confusion_matrix(truth,pred,labels=list(range(len(labels))))
    report['confusion_matrix'] = {'labels':labels,'counts':matrix.tolist()}
    for name, obj in [('metrics',report),('history',history)]:
        (args.run/f'{name}.json').write_text(json.dumps(obj,indent=2),encoding='utf8')
    with (args.run/'por_modelo.csv').open('w',encoding='utf8',newline='') as f:
        writer=csv.writer(f); writer.writerow(['modelo','precision','recall','f1','soporte'])
        for label in labels:
            scores_by_class=report['classification'][label]
            writer.writerow([label,*(scores_by_class[key] for key in ('precision','recall','f1-score','support'))])
    fig, ax = plt.subplots(figsize=(18,16))
    ConfusionMatrixDisplay(matrix,display_labels=labels).plot(ax=ax,xticks_rotation='vertical',include_values=False)
    fig.savefig(args.run/'confusion.png',bbox_inches='tight'); plt.close(fig)
    fig, axes = plt.subplots(1,2,figsize=(10,4))
    for ax, metric in zip(axes, ('accuracy','loss')):
        for name in (metric, f'val_{metric}'):
            ax.plot(range(1,len(history[name])+1),history[name],label=name)
        ax.set_xlabel('Época'); ax.legend()
    fig.savefig(args.run/'training.png'); plt.close(fig)

    smoke = []
    for label in labels:
        for index,r in enumerate(splits['test']):
            if r['modelo'] == label and (accepted[index] if label != UNKNOWN else not accepted[index]) and (pred[index] == labels.index(label) or label == UNKNOWN):
                smoke.append({'path':str((args.dataset/r['path']).resolve()), 'label':label, 'scores':scores[index].tolist()})
                break
    (args.run/'smoke.json').write_text(json.dumps(smoke,indent=2),encoding='utf8')


def export(run, target):
    metrics = json.loads((run/'metrics.json').read_text(encoding='utf8'))
    if metrics.get('architecture','mobilenetv2') != 'mobilenetv2':
        raise ValueError('La exportación web de esta arquitectura requiere verificar operadores y paridad.')
    labels = metrics['confusion_matrix']['labels']
    if len(set(labels)-{UNKNOWN}) < 2 or not set(labels) <= {*LABELS,UNKNOWN} or not metrics.get('unknown_samples') or target.exists():
        raise ValueError('Evaluación incompatible o destino ya existente.')
    # Formato Layers de TensorFlow.js, a partir del HDF5 Keras legado.
    import h5py
    with tempfile.TemporaryDirectory() as temp:
        with h5py.File(run/'vehiculos.h5','r') as h5, (Path(temp)/'weights.bin').open('wb') as blob:
            root=h5['model_weights']; manifest=[]
            decode=lambda x:x.decode() if isinstance(x,bytes) else str(x)
            for key in root.attrs['layer_names']:
                group=root[key]
                for weight in group.attrs['weight_names']:
                    name=decode(weight).removesuffix(':0')
                    values=np.asarray(group[weight],dtype='<f4')
                    blob.write(values.tobytes())
                    manifest.append(dict(name=name,shape=list(values.shape),dtype='float32'))
            topology=dict(model_config=json.loads(h5.attrs['model_config']),keras_version=decode(h5.attrs['keras_version']),backend='tensorflow')
            model=dict(format='layers-model',generatedBy='Keras HDF5',convertedBy='SIGE-GNV',modelTopology=topology,
                       weightsManifest=[dict(paths=['weights.bin'],weights=manifest)])
            (Path(temp)/'model.json').write_text(json.dumps(model),encoding='utf8')
        (Path(temp)/'metadata.json').write_text(json.dumps({'version':2,'size':224,'labels':labels,
            'threshold':metrics['threshold'],'margin':metrics['margin']}),encoding='utf8')
        shutil.copytree(temp,target)


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    commands = cli.add_subparsers(dest='command',required=True)
    train = commands.add_parser('train')
    train.add_argument('dataset',type=Path); train.add_argument('run',type=Path)
    train.add_argument('--epochs',type=int,default=25); train.add_argument('--umbral',type=float,default=.65)
    train.add_argument('--margen',type=float,default=.15)
    train.add_argument('--calibrar',action='store_true',help='Ajusta la abstención exclusivamente sobre validación.')
    train.add_argument('--tope-originales',type=int,choices=(70,210,350,525,700),help='Presupuesto por clase en entrenamiento (70%% del hito); validación/test quedan fijos.')
    train.add_argument('--weights',type=Path,help='Pesos ImageNet 1.0, 224, sin cabeza, descargados previamente.')
    train.add_argument('--arquitectura',choices=('mobilenetv2','mobilenetv3','efficientnetb0','efficientnetv2b0','resnet50'),default='mobilenetv2')
    deploy = commands.add_parser('export')
    deploy.add_argument('run',type=Path); deploy.add_argument('target',type=Path)
    args = cli.parse_args()
    if args.command == 'train':
        main(args)
    else:
        export(args.run, args.target)
