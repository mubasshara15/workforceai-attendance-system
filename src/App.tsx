import React, { useEffect, useRef, useState } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { Camera, UserPlus, ScanFace, Loader2, AlertCircle, Trash2 } from 'lucide-react';

// Models URL from jsdelivr
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

interface RegisteredFace {
  id: string;
  name: string;
  descriptor: Float32Array;
  imageUrl: string;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [registeredFaces, setRegisteredFaces] = useState<RegisteredFace[]>([]);
  const [newName, setNewName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  
  const [isRecognizing, setIsRecognizing] = useState(true);
  
  const animationFrameRef = useRef<number>(0);
  const faceMatcherRef = useRef<faceapi.FaceMatcher | null>(null);

  // Load models
  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setIsModelsLoaded(true);
      } catch (err) {
        console.error('Error loading models:', err);
        setError('Failed to load face recognition models. Please check your connection.');
      }
    };
    loadModels();
  }, []);

  // Start camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
        setError('Failed to access camera. Please ensure you have granted camera permissions.');
      }
    };
    
    if (isModelsLoaded) {
      startCamera();
    }
    
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isModelsLoaded]);

  // Update face matcher when registered faces change
  useEffect(() => {
    if (registeredFaces.length > 0) {
      const labeledDescriptors = registeredFaces.map(
        face => new faceapi.LabeledFaceDescriptors(face.name, [face.descriptor])
      );
      faceMatcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    } else {
      faceMatcherRef.current = null;
    }
  }, [registeredFaces]);

  // Recognition loop
  useEffect(() => {
    const detectFaces = async () => {
      if (!videoRef.current || !canvasRef.current || !isCameraReady || !isRecognizing) {
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        animationFrameRef.current = requestAnimationFrame(detectFaces);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        animationFrameRef.current = requestAnimationFrame(detectFaces);
        return;
      }

      // Match canvas size to video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      try {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptors();

        const resizedDetections = faceapi.resizeResults(detections, {
          width: video.videoWidth,
          height: video.videoHeight,
        });

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          resizedDetections.forEach(detection => {
            const box = detection.detection.box;
            let label = 'Unknown';
            let color = '#ef4444'; // red for unknown

            if (faceMatcherRef.current) {
              const bestMatch = faceMatcherRef.current.findBestMatch(detection.descriptor);
              if (bestMatch.label !== 'unknown') {
                label = `${bestMatch.label} (${Math.round((1 - bestMatch.distance) * 100)}%)`;
                color = '#22c55e'; // green for known
              }
            }

            // Draw box
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            // Draw label background
            ctx.fillStyle = color;
            ctx.fillRect(box.x, box.y - 30, box.width, 30);

            // Draw label text
            ctx.fillStyle = '#ffffff';
            ctx.font = '16px Inter, sans-serif';
            ctx.fillText(label, box.x + 5, box.y - 10);
          });
        }
      } catch (err) {
        console.error('Detection error:', err);
      }

      animationFrameRef.current = requestAnimationFrame(detectFaces);
    };

    if (isModelsLoaded && isCameraReady) {
      detectFaces();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isModelsLoaded, isCameraReady, isRecognizing]);

  const handleVideoPlay = () => {
    setIsCameraReady(true);
  };

  const registerFace = async () => {
    if (!newName.trim() || !videoRef.current) return;
    
    setIsRegistering(true);
    
    try {
      const video = videoRef.current;
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        alert('No face detected. Please look directly at the camera.');
        setIsRegistering(false);
        return;
      }

      // Extract face image for display
      const box = detection.detection.box;
      const faceCanvas = document.createElement('canvas');
      faceCanvas.width = box.width;
      faceCanvas.height = box.height;
      const ctx = faceCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(
          video,
          box.x, box.y, box.width, box.height,
          0, 0, box.width, box.height
        );
      }
      const imageUrl = faceCanvas.toDataURL('image/jpeg');

      const newFace: RegisteredFace = {
        id: Date.now().toString(),
        name: newName.trim(),
        descriptor: detection.descriptor,
        imageUrl,
      };

      setRegisteredFaces(prev => [...prev, newFace]);
      setNewName('');
    } catch (err) {
      console.error('Registration error:', err);
      alert('Failed to register face. Please try again.');
    } finally {
      setIsRegistering(false);
    }
  };

  const removeFace = (id: string) => {
    setRegisteredFaces(prev => prev.filter(face => face.id !== id));
  };

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-red-500/30 p-6 rounded-xl max-w-md w-full text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-semibold text-white">Initialization Error</h2>
          <p className="text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500/30">
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <ScanFace className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">FaceID System</h1>
          </div>
          
          {!isModelsLoaded && (
            <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-800/50 px-3 py-1.5 rounded-full">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading AI Models...
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Camera View */}
          <div className="lg:col-span-2 space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 aspect-video shadow-2xl">
              {!isCameraReady && isModelsLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-3">
                  <Camera className="w-8 h-8" />
                  <p>Starting camera...</p>
                </div>
              )}
              
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onPlay={handleVideoPlay}
                className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />
              
              {/* Status Overlay */}
              <div className="absolute top-4 left-4 flex gap-2">
                <div className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 backdrop-blur-md ${isRecognizing ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700'}`}>
                  <div className={`w-2 h-2 rounded-full ${isRecognizing ? 'bg-green-400 animate-pulse' : 'bg-zinc-500'}`} />
                  {isRecognizing ? 'Live Recognition Active' : 'Recognition Paused'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
              <div>
                <h3 className="font-medium text-white">Recognition Mode</h3>
                <p className="text-sm text-zinc-400">Continuously scan for registered faces</p>
              </div>
              <button
                onClick={() => setIsRecognizing(!isRecognizing)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${isRecognizing ? 'bg-indigo-500' : 'bg-zinc-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isRecognizing ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Registration Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Register Face</h2>
                  <p className="text-sm text-zinc-400">Add a new person to the system</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-zinc-400 mb-1.5">
                    Person's Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    disabled={!isModelsLoaded || !isCameraReady || isRegistering}
                  />
                </div>
                
                <button
                  onClick={registerFace}
                  disabled={!newName.trim() || !isModelsLoaded || !isCameraReady || isRegistering}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isRegistering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Scanning Face...
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      Capture & Register
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Registered Faces List */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex-1">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center justify-between">
                <span>Database</span>
                <span className="bg-zinc-800 text-zinc-300 text-xs py-1 px-2.5 rounded-full font-medium">
                  {registeredFaces.length} entries
                </span>
              </h2>

              {registeredFaces.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-zinc-800 rounded-xl">
                  <UserPlus className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm">No faces registered yet.<br/>Add someone to get started.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {registeredFaces.map(face => (
                    <div key={face.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 p-3 rounded-xl group hover:border-zinc-700 transition-colors">
                      <div className="flex items-center gap-3">
                        <img 
                          src={face.imageUrl} 
                          alt={face.name} 
                          className="w-10 h-10 rounded-lg object-cover bg-zinc-800"
                        />
                        <div>
                          <p className="font-medium text-white text-sm">{face.name}</p>
                          <p className="text-xs text-zinc-500 font-mono">ID: {face.id.slice(-6)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFace(face.id)}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Remove face"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #3f3f46;
          border-radius: 20px;
        }
      `}</style>
    </div>
  );
}
