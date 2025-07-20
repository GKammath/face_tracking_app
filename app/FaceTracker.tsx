'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';

export default function FaceTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionLoopRef = useRef<number>(0);
  const isDetectionRunning = useRef<boolean>(false);

  const [isRecording, setIsRecording] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [faceDetectionReady, setFaceDetectionReady] = useState(false);
  const [facesDetected, setFacesDetected] = useState(0);
  const [detectionActive, setDetectionActive] = useState(false);

  // Load face detection models
  const loadModels = useCallback(async () => {
    try {
      console.log('Loading face detection models...');
      await Promise.all([
        faceapi.nets.tinyFaceDetector.load('/models'),
        faceapi.nets.faceLandmark68Net.load('/models'),
        faceapi.nets.faceExpressionNet.load('/models')
      ]);
      console.log('Models loaded successfully');
      setModelsLoading(false);
    } catch (err) {
      console.error('Failed to load models:', err);
      setError('Failed to load face detection models');
      setModelsLoading(false);
    }
  }, []);

  // Initialize camera
  const initCamera = useCallback(async () => {
    try {
      console.log('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640, min: 320 }, 
          height: { ideal: 480, min: 240 },
          frameRate: { ideal: 30, min: 15 }
        },
        audio: true
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          console.log('Video loaded, dimensions:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
          // Wait for video to be ready and playing
          videoRef.current!.play().then(() => {
            setTimeout(() => {
              if (videoRef.current && videoRef.current.videoWidth > 0) {
                console.log('Video is ready for face detection');
                setFaceDetectionReady(true);
              }
            }, 1000);
          }).catch(err => {
            console.error('Video play failed:', err);
          });
        };
      }
    } catch (err) {
      console.error('Camera access failed:', err);
      setError('Failed to access camera. Please grant permissions and refresh.');
    }
  }, []);

  // Enhanced face detection with proper video + overlay rendering
  const detectAndDraw = useCallback(async () => {
    // Prevent multiple detection loops running simultaneously
    if (isDetectionRunning.current || !videoRef.current || !canvasRef.current || !faceDetectionReady || modelsLoading) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Check if video is actually playing and has valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0 || video.paused || video.ended) {
      // Retry after a short delay
      setTimeout(() => {
        if (faceDetectionReady) {
          detectionLoopRef.current = requestAnimationFrame(detectAndDraw);
        }
      }, 100);
      return;
    }

    // Mark detection as running
    isDetectionRunning.current = true;

    try {
      // Set canvas size to match video exactly
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        console.log('Canvas resized to match video:', canvas.width, 'x', canvas.height);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        isDetectionRunning.current = false;
        return;
      }

      // Always clear canvas and draw the current video frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Perform face detection with optimized settings
      const detections = await faceapi.detectAllFaces(
        video, 
        new faceapi.TinyFaceDetectorOptions({ 
          inputSize: 512,  // Higher input size for better accuracy
          scoreThreshold: 0.3  // Lower threshold for better detection
        })
      );

      const currentTime = Date.now();

      if (detections.length > 0) {
        console.log(`✅ Detected ${detections.length} face(s) with confidences:`, 
          detections.map(d => (d.score * 100).toFixed(1) + '%').join(', '));
        
        setFacesDetected(detections.length);
        setDetectionActive(true);

        // Draw enhanced face detection markers on top of video
        detections.forEach((detection, index) => {
          const box = detection.box;
          const confidence = detection.score;
          
          // Ensure coordinates are within canvas bounds
          const x = Math.max(0, Math.min(box.x, canvas.width - box.width));
          const y = Math.max(0, Math.min(box.y, canvas.height - box.height));
          const width = Math.min(box.width, canvas.width - x);
          const height = Math.min(box.height, canvas.height - y);
          
          // Draw main detection rectangle with thicker border
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 4;
          ctx.strokeRect(x, y, width, height);
          
          // Draw corner markers for better visibility
          const cornerSize = Math.min(25, width * 0.15, height * 0.15);
          ctx.strokeStyle = '#ff0000';
          ctx.lineWidth = 5;
          
          // Top-left corner
          ctx.beginPath();
          ctx.moveTo(x, y + cornerSize);
          ctx.lineTo(x, y);
          ctx.lineTo(x + cornerSize, y);
          ctx.stroke();
          
          // Top-right corner
          ctx.beginPath();
          ctx.moveTo(x + width - cornerSize, y);
          ctx.lineTo(x + width, y);
          ctx.lineTo(x + width, y + cornerSize);
          ctx.stroke();
          
          // Bottom-left corner
          ctx.beginPath();
          ctx.moveTo(x, y + height - cornerSize);
          ctx.lineTo(x, y + height);
          ctx.lineTo(x + cornerSize, y + height);
          ctx.stroke();
          
          // Bottom-right corner
          ctx.beginPath();
          ctx.moveTo(x + width - cornerSize, y + height);
          ctx.lineTo(x + width, y + height);
          ctx.lineTo(x + width, y + height - cornerSize);
          ctx.stroke();
          
          // Draw center crosshair
          const centerX = x + width / 2;
          const centerY = y + height / 2;
          const crossSize = Math.min(15, width * 0.1);
          
          ctx.strokeStyle = '#ffff00';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(centerX - crossSize, centerY);
          ctx.lineTo(centerX + crossSize, centerY);
          ctx.moveTo(centerX, centerY - crossSize);
          ctx.lineTo(centerX, centerY + crossSize);
          ctx.stroke();
          
          // Draw face label with background
          const label = `Face ${index + 1} (${(confidence * 100).toFixed(0)}%)`;
          const labelY = Math.max(25, y - 15);
          
          // Text styling
          ctx.font = 'bold 16px Arial';
          const textMetrics = ctx.measureText(label);
          
          // Text background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.fillRect(x - 3, labelY - 20, textMetrics.width + 6, 25);
          
          // Text
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, x, labelY);
          
          // Draw confidence indicator bar
          const barWidth = width;
          const barHeight = 6;
          const confidenceWidth = barWidth * confidence;
          
          // Confidence bar background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(x, y + height + 8, barWidth, barHeight);
          
          // Confidence bar fill
          if (confidence > 0.7) ctx.fillStyle = '#00ff00';
          else if (confidence > 0.5) ctx.fillStyle = '#ffff00';
          else ctx.fillStyle = '#ff7700';
          
          ctx.fillRect(x, y + height + 8, confidenceWidth, barHeight);
          
          // Add pulsing effect for high confidence detections
          if (confidence > 0.6) {
            const pulse = Math.sin(currentTime * 0.01) * 0.5 + 0.5;
            ctx.strokeStyle = `rgba(0, 255, 0, ${pulse})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(x - 5, y - 5, width + 10, height + 10);
          }
        });
      } else {
        console.log('❌ No faces detected');
        setFacesDetected(0);
        setDetectionActive(false);
      }

    } catch (err) {
      console.error('Face detection error:', err);
      setDetectionActive(false);
    } finally {
      // Mark detection as not running
      isDetectionRunning.current = false;
    }

    // Continue detection loop with appropriate delay
    if (faceDetectionReady) {
      // Use shorter delay for more responsive detection
      setTimeout(() => {
        detectionLoopRef.current = requestAnimationFrame(detectAndDraw);
      }, 50); // ~20 FPS detection rate
    }
  }, [faceDetectionReady, modelsLoading]);

  // Start detection loop
  const startDetectionLoop = useCallback(() => {
    if (faceDetectionReady && !modelsLoading && !isDetectionRunning.current) {
      console.log('🚀 Starting enhanced face detection...');
      detectAndDraw();
    }
  }, [faceDetectionReady, modelsLoading, detectAndDraw]);

  // Start recording
  const startRecording = useCallback(() => {
    if (!canvasRef.current || !streamRef.current) {
      setError('Camera or canvas not ready');
      return;
    }

    try {
      console.log('Starting recording...');
      
      // Get canvas stream (this now contains video + face detection overlays)
      const canvasStream = canvasRef.current.captureStream(30);
      
      // Get audio from original stream
      const audioTracks = streamRef.current.getAudioTracks();
      
      // Combine video from canvas with audio from original stream
      const combinedStream = new MediaStream();
      canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
      audioTracks.forEach(track => combinedStream.addTrack(track));

      console.log('Recording stream created with:', 
        canvasStream.getVideoTracks().length, 'video tracks and', 
        audioTracks.length, 'audio tracks');

      // Create MediaRecorder
      const recorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm'
      });

      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
          console.log('Recording chunk:', event.data.size, 'bytes');
        }
      };

      recorder.onstop = () => {
        console.log('Recording stopped, creating video...');
        const blob = new Blob(chunks, { type: 'video/webm' });
        console.log('Created video blob:', blob.size, 'bytes');
        
        const url = URL.createObjectURL(blob);
        
        // Clean up old URL
        if (videoUrl) {
          URL.revokeObjectURL(videoUrl);
        }
        
        setVideoUrl(url);
        console.log('Video ready for download');
      };

      recorder.onerror = (event) => {
        console.error('Recording error:', event);
        setError('Recording failed');
      };

      // Start recording
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      const timer = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Store timer reference
      (recorder as any).timer = timer;

    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Failed to start recording: ' + (err as Error).message);
    }
  }, [videoUrl]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('Stopping recording...');
      
      // Clear timer
      if ((mediaRecorderRef.current as any).timer) {
        clearInterval((mediaRecorderRef.current as any).timer);
      }
      
      // Stop recorder
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // Download video
  const downloadVideo = useCallback(() => {
    if (videoUrl) {
      console.log('Downloading video...');
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = `face-tracking-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }, [videoUrl]);

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Initialize everything
  useEffect(() => {
    loadModels();
    initCamera();
    
    // Cleanup
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
      if (detectionLoopRef.current) {
        cancelAnimationFrame(detectionLoopRef.current);
      }
      isDetectionRunning.current = false;
    };
  }, [loadModels, initCamera, videoUrl]);

  // Start face detection when ready (fixed to prevent infinite loop)
  useEffect(() => {
    startDetectionLoop();
  }, [startDetectionLoop]);

  // Cleanup detection loop
  useEffect(() => {
    return () => {
      if (detectionLoopRef.current) {
        cancelAnimationFrame(detectionLoopRef.current);
      }
      isDetectionRunning.current = false;
    };
  }, []);

  // Loading state
  if (modelsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-bold mb-2">Loading Face Detection...</div>
          <div className="text-gray-600">Please wait a moment</div>
          <div className="mt-4 animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md p-6 bg-red-50 rounded-lg">
          <div className="text-red-600 font-bold mb-2">Error</div>
          <div className="text-red-800 mb-4">{error}</div>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8">Face Tracking & Recording</h1>
        
        {/* Video Display with canvas overlay */}
        <div className="relative mb-6 flex justify-center">
          <div className="relative inline-block">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="rounded-lg shadow-lg block"
              style={{ maxWidth: '640px', width: '100%', height: 'auto' }}
            />
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 rounded-lg pointer-events-none"
              style={{ 
                maxWidth: '640px', 
                width: '100%', 
                height: '100%',
                objectFit: 'cover'
              }}
            />
          </div>
        </div>

        {/* Enhanced Status */}
        <div className="text-center mb-6">
          <div className="inline-block bg-gray-100 rounded-lg px-6 py-3 mb-4">
            <div className="flex items-center justify-center gap-6 text-sm">
              <span className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${faceDetectionReady ? 'bg-green-500' : 'bg-orange-500'}`}></span>
                Status: {faceDetectionReady ? '✅ Ready' : '⏳ Initializing'}
              </span>
              <span className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${detectionActive ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`}></span>
                Detection: {detectionActive ? '🔍 Active' : '💤 Idle'}
              </span>
              <span className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${facesDetected > 0 ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                Faces: {facesDetected}
              </span>
            </div>
            {isRecording && (
              <div className="mt-2">
                <span className="text-red-600 font-bold text-lg animate-pulse">
                  🔴 REC {formatTime(recordingTime)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        {faceDetectionReady && facesDetected === 0 && (
          <div className="text-center mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
              <div className="text-blue-800 font-medium mb-2">👀 Position Your Face!</div>
              <div className="text-blue-600 text-sm">
                Look directly at the camera with good lighting for better detection
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex justify-center gap-4 mb-8">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={!faceDetectionReady}
              className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              🎥 Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              ⏹️ Stop Recording
            </button>
          )}

          {videoUrl && !isRecording && (
            <button
              onClick={downloadVideo}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              📥 Download Video
            </button>
          )}
        </div>

        {/* Video Preview */}
        {videoUrl && !isRecording && (
          <div className="max-w-2xl mx-auto">
            <h3 className="text-xl font-bold mb-4 text-center">Recorded Video</h3>
            <video
              src={videoUrl}
              controls
              className="w-full rounded-lg shadow-lg"
            />
            <p className="text-center text-gray-600 mt-2">
              Video ready! Click download button to save.
            </p>
          </div>
        )}

        {/* Debug Info */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 text-center text-xs text-gray-500">
            <div>Video: {videoRef.current?.videoWidth || 0}x{videoRef.current?.videoHeight || 0}</div>
            <div>Canvas: {canvasRef.current?.width || 0}x{canvasRef.current?.height || 0}</div>
            <div>Detection Ready: {faceDetectionReady ? 'Yes' : 'No'}</div>
            <div>Models Loaded: {!modelsLoading ? 'Yes' : 'No'}</div>
            <div>Video Playing: {videoRef.current && !videoRef.current.paused ? 'Yes' : 'No'}</div>
            <div>Detection Running: {isDetectionRunning.current ? 'Yes' : 'No'}</div>
          </div>
        )}
      </div>
    </div>
  );
}