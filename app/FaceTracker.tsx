'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';
const { TinyFaceDetectorOptions } = faceapi;

export default function FaceTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const animationRef = useRef<number>(0);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFps, setCurrentFps] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [videoUrl, setVideoUrl] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);

  const loadModels = useCallback(async () => {
    try {
      setModelsLoading(true);
      setError(null);

      await Promise.all([
        faceapi.nets.tinyFaceDetector.load('/models'),
        faceapi.nets.faceLandmark68Net.load('/models'),
        faceapi.nets.faceExpressionNet.load('/models')
      ]);

      setModelsLoading(false);
    } catch (err) {
      console.error('Model loading error:', err);
      setError('Failed to load face detection models. Please check if model files are in /public/models/');
      setModelsLoading(false);
    }
  }, []);

  const detectFaces = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !isDetecting) return;

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      const detections = await faceapi.detectAllFaces(
        video,
        new TinyFaceDetectorOptions({
          inputSize: 512,
          scoreThreshold: 0.5
        })
      );

      // Assign undefined for landmarks and expressions for type safety
      for (const detection of detections) {
        detection.landmarks = undefined;
        detection.expressions = undefined;
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (detections.length > 0) {
        const resizedDetections = faceapi.resizeResults(detections, {
          width: video.videoWidth,
          height: video.videoHeight
        });

        faceapi.draw.drawDetections(canvas, resizedDetections);

        // Filter out undefined before passing to draw functions
        const landmarksArr = resizedDetections
          .map(d => d.landmarks)
          .filter((l): l is faceapi.FaceLandmarks68 => l !== undefined);
        if (landmarksArr.length > 0) {
          faceapi.draw.drawFaceLandmarks(canvas, landmarksArr);
        }

        const expressionsArr = resizedDetections
          .map(d => d.expressions)
          .filter((e): e is faceapi.FaceExpressions => e !== undefined);
        if (expressionsArr.length > 0) {
          faceapi.draw.drawFaceExpressions(canvas, expressionsArr);
        }
      }

      const now = performance.now();
      const deltaTime = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      if (deltaTime > 0) {
        setCurrentFps(Math.round(1000 / deltaTime));
      }

      if (isDetecting) {
        animationRef.current = requestAnimationFrame(detectFaces);
      }
    } catch (err) {
      console.error('Face detection error:', err);
    }
  }, [isDetecting]);

  const startVideo = useCallback(async () => {
    if (!videoRef.current) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Camera access is not supported in this browser or context.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: true
      });

      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        setIsDetecting(true);
      };
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Failed to access camera. Please ensure camera permissions are granted.');
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!canvasRef.current) {
      setError('No canvas available for recording');
      return;
    }

    try {
      const stream = canvasRef.current.captureStream(30); // 30 FPS
      let mediaRecorder: MediaRecorder;

      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      } catch (e) {
        try {
          mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        } catch (e2) {
          mediaRecorder = new MediaRecorder(stream);
        }
      }

      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];
      setRecordingDuration(0);

      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log('ondataavailable', event.data.size);
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        console.log('onstop', recordedChunksRef.current.length);
        const blob = new Blob(recordedChunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || 'video/webm'
        });
        const url = URL.createObjectURL(blob);

        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
        }

        setVideoUrl(url);
      };

      mediaRecorderRef.current.start(100);
      setIsRecording(true);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('Recording start error:', err);
      setError('Failed to start recording. Your browser may not support this feature.');
    }
  }, [videoUrl]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  }, [isRecording]);

  const downloadVideo = useCallback(() => {
    if (videoUrl) {
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = `face-tracking-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [videoUrl]);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      if (mounted) {
        await loadModels();
        if (mounted && !modelsLoading) {
          await startVideo();
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
      setIsDetecting(false);

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }

      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }

      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }

      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [loadModels, startVideo, modelsLoading, isRecording, videoUrl]);

  useEffect(() => {
    if (isDetecting && !modelsLoading && !animationRef.current) {
      detectFaces();
    }
  }, [isDetecting, modelsLoading, detectFaces]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (modelsLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-lg font-medium">Loading face detection models...</div>
        <div className="mt-2 text-sm text-gray-600">This may take a moment</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500 text-lg font-medium mb-4">Error</div>
        <div className="text-gray-700 text-center max-w-md">{error}</div>
        <button
          onClick={() => {
            setError(null);
            setModelsLoading(true);
            loadModels().then(() => startVideo());
          }}
          className="mt-4 bg-blue-500 hover:bg-blue-600 px-4 py-2 text-white rounded transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-4 max-w-4xl mx-auto">
      <div className="relative mb-4">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="rounded-lg shadow-lg max-w-full h-auto"
          style={{ maxWidth: '640px' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 pointer-events-none rounded-lg"
          style={{ maxWidth: '640px' }}
        />
      </div>

      <div className="flex flex-col items-center space-y-4 w-full max-w-md">
        <div className="flex justify-between w-full text-sm bg-gray-100 rounded-lg px-4 py-2">
          <span>FPS: {currentFps}</span>
          <span>Status: {isDetecting ? 'Detecting' : 'Paused'}</span>
          {isRecording && (
            <span className="text-red-600 font-medium">
              Recording: {formatTime(recordingDuration)}
            </span>
          )}
        </div>

        <div className="flex space-x-3">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={!isDetecting}
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 px-6 py-2 text-white rounded-lg font-medium transition-colors"
            >
              Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="bg-red-500 hover:bg-red-600 px-6 py-2 text-white rounded-lg font-medium transition-colors"
            >
              Stop Recording
            </button>
          )}

          {videoUrl && (
            <button
              onClick={downloadVideo}
              className="bg-blue-500 hover:bg-blue-600 px-6 py-2 text-white rounded-lg font-medium transition-colors"
            >
              Download Video
            </button>
          )}
        </div>

        {videoUrl && (
          <div className="w-full">
            <h3 className="text-lg font-medium mb-2">Recorded Video:</h3>
            <video
              src={videoUrl}
              controls
              className="w-full rounded-lg shadow-lg"
              style={{ maxWidth: '640px' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}