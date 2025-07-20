declare module 'face-api.js' {
  export interface ITinyFaceDetectorOptions {
    inputSize?: number;
    scoreThreshold?: number;
  }

  export class TinyFaceDetectorOptions {
    constructor(options?: ITinyFaceDetectorOptions);
  }

  export interface FaceDetection {
    score: number;
    box: any;
    detection: any;
    landmarks?: FaceLandmarks68;
    expressions?: FaceExpressions;
  }

  export interface FaceLandmarks68 {
    positions: any[];
    shift: any;
  }

  export interface FaceExpressions {
    [expression: string]: number;
  }

  export interface Nets {
    tinyFaceDetector: {
      load(modelPath?: string): Promise<void>;
    };
    faceLandmark68Net: {
      load(modelPath?: string): Promise<void>;
    };
    faceExpressionNet: {
      load(modelPath?: string): Promise<void>;
    };
  }

  export const nets: Nets;

  export function detectAllFaces(
    input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    options?: ITinyFaceDetectorOptions | TinyFaceDetectorOptions
  ): Promise<FaceDetection[]>;

  export function resizeResults(
    results: FaceDetection[],
    dimensions: { width: number; height: number }
  ): FaceDetection[];

  export const draw: {
    drawDetections(
      canvas: HTMLCanvasElement,
      detections: FaceDetection[]
    ): void;
    drawFaceLandmarks(
      canvas: HTMLCanvasElement,
      landmarks: FaceLandmarks68[]
    ): void;
    drawFaceExpressions(
      canvas: HTMLCanvasElement,
      expressions: FaceExpressions[]
    ): void;
  };
}

const detections = await faceapi.detectAllFaces(
  video,
  new TinyFaceDetectorOptions({
    inputSize: 512,
    scoreThreshold: 0.5
  })
);

const stream = canvasRef.current.captureStream(30); // 30 FPS

console.log('Canvas updated');

mediaRecorderRef.current.ondataavailable = (event) => {
  if (event.data.size > 0) {
    recordedChunksRef.current.push(event.data);
    console.log('Chunk recorded:', event.data.size);
  }
};