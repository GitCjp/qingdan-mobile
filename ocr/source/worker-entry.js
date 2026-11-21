import { PaddleOCR } from '@paddleocr/paddleocr-js';
import {readSlip} from './slip.js';
import cvModule from '@techstark/opencv-js';
self.onmessage = async ({data}) => {
  try {
    const modelUrl = file => new URL(file, self.location.href).href;
    const engine = await PaddleOCR.create({
      textDetectionModelName: 'PP-OCRv5_mobile_det',
      textRecognitionModelName: 'PP-OCRv5_mobile_rec',
      textDetectionModelAsset: {url: modelUrl('det.tar')},
      textRecognitionModelAsset: {url: modelUrl('rec.tar')},
      textRecognitionBatchSize: 1,
      ortOptions: {backend: 'wasm', numThreads: 1, wasmPaths: modelUrl('./')}
    });
    self.postMessage({stage: 'reading'});
    const cv = cvModule instanceof Promise ? await cvModule : cvModule;
    const image = cv.matFromImageData(data);
    const [result] = await engine.predict(image, {textDetLimitSideLen: 1280, textDetLimitType: 'max', textRecScoreThresh: 0.15});
    const rows = await readSlip(result.items, data, cv, image, engine.recModel);
    self.postMessage({items: result.items, rows});
  } catch (error) {
    self.postMessage({error: String(error.message || error)});
  }
};
