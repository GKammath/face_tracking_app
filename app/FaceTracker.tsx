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
  const recordingStartTimeRef = useRef<number>(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const originalStreamRef = useRef<MediaStream | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFps, setCurrentFps] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [videoUrl, setVideoUrl] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');

  const loadModels = useCallback(async () => {
    try {
      setModelsLoading(true);
      setError(null);

      // Load models from public/models directory using the correct method
      const MODEL_URL = '/models';
      
      await Promise.all([
        faceapi.nets.tinyFaceDetector.load(MODEL_URL),
        faceapi.nets.faceLandmark68Net.load(MODEL_URL),
        faceapi.nets.faceExpressionNet.load(MODEL_URL)
      ]);

      console.log('All models loaded successfully');
      setModelsLoading(false);
    } catch (err) {
      console.error('Model loading error:', err);
      setError('Failed to load face detection models. Please ensure model files are accessible.');
      setModelsLoading(false);
    }
  }, []);

  const detectFaces = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !isDetecting) return;

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Ensure video is ready and has valid dimensions
      if (video.readyState !== 4 || video.videoWidth === 0 || video.videoHeight === 0) {
        if (isDetecting) {
          animationRef.current = requestAnimationFrame(detectFaces);
        }
        return;
      }

      // Set canvas dimensions to match video if they don't already match
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        console.log('Canvas resized to:', canvas.width, 'x', canvas.height);
      }

      // Use the simple detection method for basic face tracking
      const detections = await faceapi.detectAllFaces(
        video, 
        new TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.5
        })
      );

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear canvas and draw current video frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Draw face detection results if any faces are detected
      if (detections.length > 0 && video.videoWidth > 0 && video.videoHeight > 0) {
        // Only resize if we have valid dimensions
        const resizedDetections = faceapi.resizeResults(detections, {
          width: video.videoWidth,
          height: video.videoHeight
        });

        // Draw detection boxes using face-api
        faceapi.draw.drawDetections(canvas, resizedDetections);
        
        // Draw additional custom indicators
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.font = '18px Arial';
        ctx.fillStyle = '#00ff00';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 2;
        
        resizedDetections.forEach((detection, index) => {
          const box = detection.box;
          // Draw confidence score
          const confidence = (detection.score * 100).toFixed(1);
          ctx.fillText(`Face ${index + 1} (${confidence}%)`, box.x, box.y - 10);
          
          // Draw center dot
          ctx.fillStyle = '#ff0000';
          ctx.beginPath();
          ctx.arc(box.x + box.width/2, box.y + box.height/2, 3, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = '#00ff00';
        });
        
        // Reset shadow
        ctx.shadowBlur = 0;
      }

      // Calculate FPS
      const now = performance.now();
      const deltaTime = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      if (deltaTime > 0) {
        const fps = Math.round(1000 / deltaTime);
        setCurrentFps(fps);
      }

      if (isDetecting) {
        animationRef.current = requestAnimationFrame(detectFaces);
      }
    } catch (err) {
      console.error('Face detection error:', err);
      // Continue detection even if one frame fails
      if (isDetecting) {
        animationRef.current = requestAnimationFrame(detectFaces);
      }
    }
  }, [isDetecting]);

  const startVideo = useCallback(async () => {
    if (!videoRef.current) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Camera access is not supported in this browser.');
      setCameraPermission('denied');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        },
        audio: true
      });

      originalStreamRef.current = stream;
      videoRef.current.srcObject = stream;
      setCameraPermission('granted');
      
      videoRef.current.onloadedmetadata = () => {
        console.log('Video metadata loaded:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
        // Wait a bit more to ensure video is fully ready
        setTimeout(() => {
          setIsDetecting(true);
        }, 100);
      };

    } catch (err) {
      console.error('Camera access error:', err);
      setCameraPermission('denied');
      setError('Failed to access camera. Please grant camera and microphone permissions.');
    }
  }, []);

  const createCombinedStream = useCallback(() => {
    if (!canvasRef.current || !originalStreamRef.current) return null;

    try {
      // Get canvas stream (video with face detection overlay)
      const canvasStream = canvasRef.current.captureStream(30);
      
      // Get audio tracks from original stream
      const audioTracks = originalStreamRef.current.getAudioTracks();
      
      // Create combined stream with canvas video and original audio
      const combinedStream = new MediaStream();
      
      // Add video track from canvas
      const videoTracks = canvasStream.getVideoTracks();
      videoTracks.forEach(track => combinedStream.addTrack(track));
      
      // Add audio tracks from original stream
      audioTracks.forEach(track => combinedStream.addTrack(track));
      
      console.log('Combined stream created with', videoTracks.length, 'video tracks and', audioTracks.length, 'audio tracks');
      return combinedStream;
    } catch (err) {
      console.error('Error creating combined stream:', err);
      return null;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!canvasRef.current || !originalStreamRef.current) {
      setError('Canvas or camera stream not available for recording');
      return;
    }

    if (!videoRef.current || videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      setError('Video not ready for recording. Please wait for camera to initialize.');
      return;
    }

    try {
      const stream = createCombinedStream();
      if (!stream) {
        setError('Failed to create recording stream');
        return;
      }

      // Check if MediaRecorder is supported
      if (!window.MediaRecorder) {
        setError('MediaRecorder is not supported in this browser');
        return;
      }

      let mediaRecorder: MediaRecorder;

      // Try different MIME types for better compatibility
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
        'video/mp4',
        ''
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        try {
          if (mimeType === '' || MediaRecorder.isTypeSupported(mimeType)) {
            mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
            selectedMimeType = mimeType || 'default';
            console.log('Using MIME type:', selectedMimeType);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!mediaRecorder!) {
        setError('No supported recording format found');
        return;
      }

      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];
      
      // Reset and start recording timer
      recordingStartTimeRef.current = Date.now();
      setRecordingDuration(0);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
          console.log('Data chunk received:', event.data.size, 'bytes. Total chunks:', recordedChunksRef.current.length);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        console.log('Recording stopped. Total chunks:', recordedChunksRef.current.length);
        
        if (recordedChunksRef.current.length === 0) {
          setError('No recording data available');
          return;
        }

        const blob = new Blob(recordedChunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || 'video/webm'
        });
        
        console.log('Created blob:', blob.size, 'bytes', blob.type);
        
        if (blob.size === 0) {
          setError('Recording file is empty');
          return;
        }

        // Clean up previous video URL
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
        }

        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        console.log('Video URL created successfully');
      };

      mediaRecorderRef.current.onerror = (event: any) => {
        console.error('MediaRecorder error:', event);
        setError('Recording failed due to an error: ' + (event.error?.message || 'Unknown error'));
      };

      mediaRecorderRef.current.onstart = () => {
        console.log('Recording started successfully');
      };

      // Start recording with regular data intervals
      mediaRecorderRef.current.start(1000); // Collect data every second
      setIsRecording(true);

      // Start the recording timer
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
        setRecordingDuration(elapsed);
      }, 1000);

      console.log('Recording initiated with MIME type:', selectedMimeType);

    } catch (err) {
      console.error('Recording start error:', err);
      setError('Failed to start recording: ' + (err as Error).message);
    }
  }, [createCombinedStream, videoUrl]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('Stopping recording...');
      
      // Clear the timer first
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      // Stop the media recorder
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      
      setIsRecording(false);
      console.log('Recording stop initiated');
    } else {
      console.log('Cannot stop recording - not currently recording');
    }
  }, [isRecording]);

  const downloadVideo = useCallback(() => {
    if (!videoUrl) {
      setError('No video available for download');
      return;
    }

    try {
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = `face-tracking-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      console.log('Download initiated');
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to download video');
    }
  }, [videoUrl]);

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('Cleaning up resources...');
    
    setIsDetecting(false);

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
    }

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current && isRecording) {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      } catch (err) {
        console.error('Error stopping recorder:', err);
      }
    }

    if (originalStreamRef.current) {
      originalStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind);
      });
      originalStreamRef.current = null;
    }

    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
  }, [isRecording, videoUrl]);

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
      cleanup();
    };
  }, [loadModels, startVideo, modelsLoading, cleanup]);

  useEffect(() => {
    if (isDetecting && !modelsLoading && !animationRef.current) {
      detectFaces();
    }
  }, [isDetecting, modelsLoading, detectFaces]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const retrySetup = useCallback(() => {
    setError(null);
    setModelsLoading(true);
    setCameraPermission('prompt');
    setVideoUrl(''); // Clear any existing video
    loadModels().then(() => startVideo());
  }, [loadModels, startVideo]);

  if (modelsLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-lg font-medium">Loading face detection models...</div>
        <div className="mt-2 text-sm text-gray-600">This may take a moment</div>
        <div className="mt-4 w-64 bg-gray-200 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full animate-pulse w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-lg font-medium mb-4">Error</div>
        <div className="text-gray-700 text-center max-w-md mb-4">{error}</div>
        <button
          onClick={retrySetup}
          className="bg-blue-500 hover:bg-blue-600 px-6 py-2 text-white rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-center">Face Tracking & Recording</h1>
      
      <div className="relative mb-4">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="rounded-lg shadow-lg max-w-full h-auto"
          style={{ maxWidth: '640px', maxHeight: '480px' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 pointer-events-none rounded-lg"
          style={{ maxWidth: '640px', maxHeight: '480px' }}
        />
      </div>

      <div className="flex flex-col items-center space-y-4 w-full max-w-lg">
        <div className="flex justify-between w-full text-sm bg-gray-100 rounded-lg px-4 py-2">
          <span>FPS: {currentFps}</span>
          <span>Status: {isDetecting ? 'Detecting' : 'Paused'}</span>
          <span>Camera: {cameraPermission}</span>
        </div>

        {isRecording && (
          <div className="text-center">
            <div className="text-red-600 font-bold text-xl animate-pulse">
              🔴 REC {formatTime(recordingDuration)}
            </div>
          </div>
        )}

        <div className="flex space-x-3 flex-wrap justify-center">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={!isDetecting || cameraPermission !== 'granted'}
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed px-6 py-3 text-white rounded-lg font-medium transition-colors shadow-lg"
            >
              🎥 Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="bg-red-500 hover:bg-red-600 px-6 py-3 text-white rounded-lg font-medium transition-colors shadow-lg"
            >
              ⏹️ Stop Recording
            </button>
          )}

          {videoUrl && !isRecording && (
            <button
              onClick={downloadVideo}
              className="bg-blue-500 hover:bg-blue-600 px-6 py-3 text-white rounded-lg font-medium transition-colors shadow-lg"
            >
              📥 Download Video
            </button>
          )}
        </div>

        {videoUrl && !isRecording && (
          <div className="w-full mt-6">
            <h3 className="text-lg font-medium mb-3 text-center">Recorded Video Preview:</h3>
            <video
              src={videoUrl}
              controls
              className="w-full rounded-lg shadow-lg"
              style={{ maxWidth: '640px' }}
              onError={(e) => {
                console.error('Video playback error:', e);
                setError('Error playing recorded video');
              }}
            />
            <div className="text-sm text-gray-600 mt-2 text-center">
              Click the download button above to save this video to your device
            </div>
          </div>
        )}

        {!isDetecting && cameraPermission === 'denied' && (
          <div className="text-center text-red-600 bg-red-50 p-4 rounded-lg">
            <p className="font-medium">Camera access denied</p>
            <p className="text-sm mt-1">Please enable camera permissions and refresh the page</p>
          </div>
        )}

        {!isDetecting && cameraPermission === 'granted' && (
          <div className="text-center text-orange-600 bg-orange-50 p-4 rounded-lg">
            <p className="font-medium">Camera initializing...</p>
            <p className="text-sm mt-1">Please wait for face detection to start</p>
          </div>
        )}
      </div>
    </div>
  );
}