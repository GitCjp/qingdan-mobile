import {PaddleOCR} from '@paddleocr/paddleocr-js';
import {readSlip} from './slip.js';
import cvModule from '@techstark/opencv-js';

export async function createReader(urls) {
  const engine=await PaddleOCR.create({
    textDetectionModelName:'PP-OCRv5_mobile_det',
    textRecognitionModelName:'PP-OCRv5_mobile_rec',
    textDetectionModelAsset:{url:urls['det.tar']},
    textRecognitionModelAsset:{url:urls['rec.tar']},
    textRecognitionBatchSize:1,
    ortOptions:{backend:'wasm',numThreads:1,wasmPaths:{
      mjs:urls['ort-wasm-simd-threaded.mjs'],wasm:urls['ort-wasm-simd-threaded.wasm']
    }}
  });
  const cv=cvModule instanceof Promise ? await cvModule : cvModule;
  return async pixels=>{
    const image=cv.matFromImageData(pixels);
    try {
      const [result]=await engine.predict(image,{textDetLimitSideLen:1280,textDetLimitType:'max',textRecScoreThresh:.15});
      self.postMessage({stage:'rows'});
      return {items:result.items,rows:await readSlip(result.items,pixels,cv,image,engine.recModel)};
    } finally {image.delete();}
  };
}
