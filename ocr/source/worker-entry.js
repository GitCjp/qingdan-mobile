import { PaddleOCR } from '@paddleocr/paddleocr-js';
import { readSlip } from './slip.js';
import cvModule from '@techstark/opencv-js';

let enginePromise;

function getEngine() {
  if (!enginePromise) {
    const asset = name => new URL(name, self.location.href).href;
    enginePromise = PaddleOCR.create({
      textDetectionModelName: 'PP-OCRv5_mobile_det',
      textRecognitionModelName: 'PP-OCRv5_mobile_rec',
      textDetectionModelAsset: {url: asset('det.tar')},
      textRecognitionModelAsset: {url: asset('rec.tar')},
      fetch: url => fetch(url, {cache: 'force-cache'}),
      textRecognitionBatchSize: 1,
      ortOptions: {backend: 'wasm', numThreads: 1, wasmPaths: asset('./')}
    });
  }
  return enginePromise;
}

self.onmessage = async ({data}) => {
  try {
    const engine = await getEngine();
    if (data.type === 'warmup') {
      self.postMessage({stage: 'ready'});
      return;
    }
    self.postMessage({stage: 'reading'});
    const cv = cvModule instanceof Promise ? await cvModule : cvModule;
    const image = cv.matFromImageData(data);
    try {
      const [result] = await engine.predict(image, {
        textDetLimitSideLen: 1280, textDetLimitType: 'max', textRecScoreThresh: 0.15
      });
      self.postMessage({stage: 'rows'});
      const rows = await readSlip(result.items, data, cv, image, engine.recModel);
      self.postMessage({items: result.items, rows});
    } finally {
      image.delete();
    }
  } catch (error) {
    self.postMessage({error: String(error.message || error)});
  }
};
