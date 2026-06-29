import React, { useEffect, useRef, useState } from 'react';
import Dashboard from "./components/Dashboard";
import * as faceapi from '@vladmandic/face-api';
import {
  Camera,
  UserPlus,
  ScanFace,
  Loader2,
  AlertCircle,
  Trash2,
  Video,
  ImageIcon,
  Clock
} from 'lucide-react';
import { Employee } from "./types/Employee";
import { Attendance } from "./types/Attendance";
import { API_BASE_URL } from "./config";
import { markAttendance } from "./lib/attendance";
import Notifications, { notify } from "./components/Notifications";

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
const LIVE_DETECTION_INTERVAL_MS = 500;

export default function App() {
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number>(0);
  const faceMatcherRef = useRef<faceapi.FaceMatcher | null>(null);
  const lastRecognitionRef = useRef<Record<string, number>>({});
  const isDetectingRef = useRef<boolean>(false);

  const [isModelsLoaded, setIsModelsLoaded] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeName, setEmployeeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isKnownEmployee, setIsKnownEmployee] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(true);
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [dashboardStats, setDashboardStats] = useState({
    employees: 0,
    present: 0,
    late: 0,
    absent: 0,
  });

  const fetchDashboardStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/dashboard`);
      const data = await response.json();
      setDashboardStats(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAttendance = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/attendance`);
      const data = await response.json();

      const formatted = data.map((record: any) => {
        const employee = employees.find(
          emp => String(emp.employeeId) === String(record.employee_id)
        );
        return {
          id: record.id.toString(),
          employeeId: record.employee_id,
          employeeName: employee?.name || record.employee_id,
          date: new Date(record.attendance_date).toLocaleDateString(),
          checkIn: record.check_in
            ? new Date(record.check_in).toLocaleTimeString()
            : "-",
          checkOut: record.check_out
            ? new Date(record.check_out).toLocaleTimeString()
            : "-",
          status: record.status,
        };
      });

      setAttendanceRecords(formatted);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAttendance();
    fetchDashboardStats();
  }, []);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/employees`);
        const data = await response.json();

        const loadedEmployees: Employee[] = data.map((employee: any) => ({
          id: employee.id.toString(),
          employeeId: employee.employee_id,
          name: employee.name,
          email: employee.email,
          department: employee.department,
          role: employee.role,
          imageUrl: employee.image_url,
          descriptor: new Float32Array(JSON.parse(employee.face_descriptor)),
        }));

        setEmployees(loadedEmployees);
      } catch (err) {
        console.error(err);
      }
    };

    loadEmployees();
  }, []);

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

  useEffect(() => {
    if (!cameraMode) return;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraReady(true);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to access camera. Please ensure camera permissions are granted.');
      }
    };

    startCamera();

    return () => {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach((track) => track.stop());
      setCameraReady(false);
    };
  }, [cameraMode]);

  // FaceMatcher uses database id as the label so two employees with the same
  // name are never confused. Display name is resolved separately at match time.
  useEffect(() => {
    if (employees.length > 0) {
      const labeledDescriptors = employees.map(
        (face: Employee) =>
          new faceapi.LabeledFaceDescriptors(face.id, [face.descriptor])
      );
      faceMatcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    } else {
      faceMatcherRef.current = null;
    }
  }, [employees]);

  const drawBox = (
    ctx: CanvasRenderingContext2D,
    box: { x: number; y: number; width: number; height: number },
    label: string,
    color: string
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.fillStyle = color;
    ctx.fillRect(box.x, box.y - 30, box.width, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText(label, box.x + 5, box.y - 10);
  };

  const handleRecognition = async (matchedEmployee: Employee) => {
    setIsKnownEmployee(true);
    setSelectedEmployee(matchedEmployee);

    // Optimistic local record so the attendance list shows immediately.
    setAttendanceRecords(prev => {
      const today = new Date().toLocaleDateString();
      const exists = prev.some(
        record =>
          record.employeeId === matchedEmployee.employeeId &&
          record.date === today
      );
      if (exists) return prev;
      return [
        {
          id: Date.now().toString(),
          employeeId: matchedEmployee.employeeId || "UNKNOWN",
          employeeName: matchedEmployee.name,
          date: today,
          checkIn: new Date().toLocaleTimeString(),
          status: "Present",
        },
        ...prev,
      ];
    });

    const now = Date.now();
    const lastSeen = lastRecognitionRef.current[matchedEmployee.employeeId] || 0;

    if (now - lastSeen < 30000) return;

    lastRecognitionRef.current[matchedEmployee.employeeId] = now;

    try {
      const result = await markAttendance(matchedEmployee.employeeId);

      if (result.success) {
        fetchAttendance();
        fetchDashboardStats();

        if (result.action === "checkin") {
          notify.success(`${matchedEmployee.name} checked in successfully`);
        }
        if (result.action === "checkout") {
          notify.success(`${matchedEmployee.name} checked out successfully`);
        }
      }

      if (result.action === "completed") {
        notify.info(`${matchedEmployee.name} has already completed attendance today`);
      }

      if (result.action === "too-soon") {
        notify.info(
          result.message || `${matchedEmployee.name} cannot check out yet`
        );
      }

    } catch (err) {
      console.error("Attendance error:", err);
      notify.error("Failed to record attendance. Please try again.");
    }
  };

  // bestMatch.label is the database id; resolve it to the employee record so
  // the displayed label shows the name, never the numeric id.
  const processDetections = (
    detections: any,
    ctx: CanvasRenderingContext2D
  ) => {
    if (!detections || detections.length === 0) {
      setSelectedEmployee(null);
      setIsKnownEmployee(false);
      return;
    }

    let anyKnown = false;

    detections.forEach((detection: any) => {
      const box = detection.detection.box;
      let label = 'Unknown';
      let color = '#ef4444';

      if (faceMatcherRef.current) {
        const bestMatch = faceMatcherRef.current.findBestMatch(
          detection.descriptor
        );

        if (bestMatch.label !== 'unknown') {
          const matchedEmployee = employees.find(
            emp => emp.id === bestMatch.label
          );

          if (matchedEmployee) {
            label = `${matchedEmployee.name} (${Math.round(
              (1 - bestMatch.distance) * 100
            )}%)`;
            color = '#22c55e';
            anyKnown = true;
            handleRecognition(matchedEmployee);
          }
        }
      }

      drawBox(ctx, box, label, color);
    });

    if (!anyKnown) {
      setIsKnownEmployee(false);
      setSelectedEmployee(null);
    }
  };

  // IMAGE-UPLOAD: single detection pass on the uploaded photo.
  useEffect(() => {
    const detectImage = async () => {
      if (!imageRef.current || !canvasRef.current || !imageSrc || !isRecognizing) {
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        return;
      }

      const image = imageRef.current;
      const canvas = canvasRef.current;

      if (image.naturalWidth === 0 || image.naturalHeight === 0) return;

      if (canvas.width !== image.naturalWidth || canvas.height !== image.naturalHeight) {
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
      }

      try {
        const detections = await faceapi
          .detectAllFaces(image, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptors();

        const resizedDetections = faceapi.resizeResults(detections, {
          width: image.naturalWidth,
          height: image.naturalHeight,
        });

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          processDetections(resizedDetections, ctx);
        }
      } catch (err) {
        console.error('Detection error:', err);
      }
    };

    if (isModelsLoaded) detectImage();
  }, [isModelsLoaded, isRecognizing, employees, imageSrc]);

  // LIVE-CAMERA: throttled requestAnimationFrame loop, torn down on cleanup.
  useEffect(() => {
    if (!isModelsLoaded || !cameraMode || !cameraReady || !isRecognizing) return;

    let cancelled = false;
    let lastRun = 0;

    const loop = async (time: number) => {
      if (cancelled) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      const ready =
        video &&
        canvas &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0;

      if (
        ready &&
        time - lastRun >= LIVE_DETECTION_INTERVAL_MS &&
        !isDetectingRef.current
      ) {
        lastRun = time;
        isDetectingRef.current = true;

        try {
          if (
            canvas.width !== video.videoWidth ||
            canvas.height !== video.videoHeight
          ) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          const detections = await faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptors();

          if (cancelled) return;

          const resizedDetections = faceapi.resizeResults(detections, {
            width: video.videoWidth,
            height: video.videoHeight,
          });

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            processDetections(resizedDetections, ctx);
          }
        } catch (err) {
          console.error('Live detection error:', err);
        } finally {
          isDetectingRef.current = false;
        }
      }

      if (!cancelled) {
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrameRef.current);
      isDetectingRef.current = false;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [isModelsLoaded, cameraMode, cameraReady, isRecognizing, employees]);

  useEffect(() => {
    if (employees.length > 0) fetchAttendance();
  }, [employees]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  };

  const registerFace = async () => {
    if (!employeeName.trim()) return;

    setIsRegistering(true);

    try {
      const image = imageRef.current;
      if (!image) {
        notify.error('Upload an image first.');
        setIsRegistering(false);
        return;
      }

      const detection = await faceapi
        .detectSingleFace(image, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        notify.error('No face detected. Please upload an image with a clear face.');
        setIsRegistering(false);
        return;
      }

      const box = detection.detection.box;
      const faceCanvas = document.createElement('canvas');
      faceCanvas.width = box.width;
      faceCanvas.height = box.height;
      const ctx = faceCanvas.getContext('2d');
      if (ctx && image) {
        ctx.drawImage(
          image,
          box.x, box.y, box.width, box.height,
          0, 0, box.width, box.height
        );
      }
      const imageUrl = faceCanvas.toDataURL('image/jpeg');

      const response = await fetch(`${API_BASE_URL}/api/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          name: employeeName.trim(),
          email,
          department,
          role,
          image_url: imageUrl,
          face_descriptor: JSON.stringify(Array.from(detection.descriptor)),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 409) {
          notify.error(data.error || 'An employee with that ID already exists.');
        } else if (response.status === 400) {
          notify.error(data.error || 'Validation error. Please check the form.');
        } else {
          notify.error('Server error. Please try again.');
        }
        return;
      }

      const data = await response.json();

      const newEmployee: Employee = {
        id: data.id.toString(),
        employeeId,
        name: employeeName.trim(),
        email,
        department,
        role,
        descriptor: detection.descriptor,
        imageUrl,
      };

      setEmployees(prev => [...prev, newEmployee]);
      fetchDashboardStats();

      setEmployeeName('');
      setEmployeeId('');
      setEmail('');
      setDepartment('');
      setRole('');

      notify.success('Employee registered successfully');

    } catch (err) {
      console.error('Registration error:', err);
      notify.error('Network error. Failed to register employee. Please try again.');
    } finally {
      setIsRegistering(false);
    }
  };

  const removeEmployee = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/employees/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        notify.error('Failed to delete employee.');
        return;
      }

      setEmployees(prev => prev.filter(employee => employee.id !== id));
      fetchDashboardStats();
    } catch (err) {
      console.error('Delete error:', err);
      notify.error('Network error. Failed to delete employee.');
    }
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
      <Notifications />
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <ScanFace className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">WorkForceAI</h1>
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

        <Dashboard stats={dashboardStats} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Image View */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 aspect-video shadow-2xl flex items-center justify-center">

              {cameraMode ? (
                <div className="relative w-full h-full">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  />
                  <div className="absolute top-4 left-4 z-10">
                    <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm font-medium">
                      ● Live Recognition Active
                    </div>
                  </div>
                </div>
              ) : !imageSrc ? (
                <div className="text-center px-6 py-10 text-zinc-500">
                  <Camera className="w-8 h-8 mx-auto mb-4" />
                  <h2 className="text-lg font-semibold text-white mb-2">
                    Upload an image
                  </h2>
                  <p className="text-sm text-zinc-400">
                    Select a photo with a face to recognize or register.
                  </p>
                </div>
              ) : (
                <div className="relative w-full h-full">
                  <img
                    ref={imageRef}
                    src={imageSrc}
                    alt="Uploaded"
                    className="absolute inset-0 w-full h-full object-contain"
                    onLoad={() => setError(null)}
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  />
                </div>
              )}

            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setCameraMode(false)}
                className={`flex-1 py-2 rounded-lg ${
                  !cameraMode ? 'bg-indigo-600 text-white' : 'bg-zinc-800'
                }`}
              >
                <ImageIcon className="w-4 h-4 inline mr-2" />
                Upload
              </button>
              <button
                onClick={() => setCameraMode(true)}
                className={`flex-1 py-2 rounded-lg ${
                  cameraMode ? 'bg-indigo-600 text-white' : 'bg-zinc-800'
                }`}
              >
                <Video className="w-4 h-4 inline mr-2" />
                Live Camera
              </button>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Upload Image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="block w-full text-sm text-zinc-200 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-500 file:text-white hover:file:bg-indigo-400"
              />
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-white">Recognition Mode</h3>
                  <p className="text-sm text-zinc-400">
                    Analyze the uploaded image for known faces
                  </p>
                </div>
                <button
                  onClick={() => setIsRecognizing(!isRecognizing)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
                    isRecognizing ? 'bg-indigo-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isRecognizing ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">

            {/* Registration Card */}
            {!isKnownEmployee && (
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

                <div className="space-y-3">
                  <input
                    type="text"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    placeholder="Employee ID"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5"
                  />
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="Employee Name"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5"
                  />
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Department"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5"
                  />
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Role"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5"
                  />
                </div>

                <button
                  onClick={registerFace}
                  disabled={
                    !employeeName.trim() ||
                    !isModelsLoaded ||
                    !imageSrc ||
                    isRegistering
                  }
                  className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
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
            )}

            {/* Today's Attendance Count */}
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <h3 className="text-green-400 text-sm">Today's Attendance</h3>
              <p className="text-3xl font-bold text-white mt-2">
                {attendanceRecords.length}
              </p>
            </div>

            {/* Recognized Employee Info */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-white mb-4">
                Employee Information
              </h2>

              {selectedEmployee ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={selectedEmployee.imageUrl}
                      alt={selectedEmployee.name}
                      className="w-16 h-16 rounded-xl object-cover border border-zinc-700"
                    />
                    <div>
                      <h3 className="text-white font-semibold text-lg">
                        {selectedEmployee.name}
                        <div className="mt-2 inline-flex items-center px-2 py-1 rounded-full bg-green-500/10 text-green-400 text-xs">
                          Attendance Marked
                        </div>
                      </h3>
                      <p className="text-zinc-400 text-sm">{selectedEmployee.role}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-sm">
                    <div className="bg-zinc-950 p-3 rounded-lg">
                      <span className="text-zinc-500">Employee ID</span>
                      <p className="text-white mt-1">{selectedEmployee.employeeId}</p>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-lg">
                      <span className="text-zinc-500">Email</span>
                      <p className="text-white mt-1">{selectedEmployee.email}</p>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-lg">
                      <span className="text-zinc-500">Department</span>
                      <p className="text-white mt-1">{selectedEmployee.department}</p>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-lg">
                      <span className="text-zinc-500">Role</span>
                      <p className="text-white mt-1">{selectedEmployee.role}</p>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-lg">
                      <span className="text-zinc-500">Check In</span>
                      <p className="text-white mt-1">
                        {attendanceRecords.find(
                          record =>
                            String(record.employeeId) ===
                            String(selectedEmployee.employeeId)
                        )?.checkIn || "-"}
                      </p>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-lg">
                      <span className="text-zinc-500">Check Out</span>
                      <p className="text-white mt-1">
                        {attendanceRecords.find(
                          record =>
                            String(record.employeeId) ===
                            String(selectedEmployee.employeeId)
                        )?.checkOut || "-"}
                      </p>
                    </div>
                    <div className="bg-zinc-950 p-3 rounded-lg">
                      <span className="text-zinc-500">Attendance Status</span>
                      <p className="text-green-400 mt-1">
                        {attendanceRecords.find(
                          record =>
                            String(record.employeeId) ===
                            String(selectedEmployee.employeeId)
                        )?.status || "Not Marked"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-zinc-500">No employee recognized yet</p>
                </div>
              )}
            </div>

            {/* Attendance History */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Attendance History
              </h2>

              {attendanceRecords.length === 0 ? (
                <p className="text-zinc-500 text-sm">No attendance records</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400">
                        <th className="text-left py-2">Employee</th>
                        <th className="text-left py-2">ID</th>
                        <th className="text-left py-2">Check In</th>
                        <th className="text-left py-2">Check Out</th>
                        <th className="text-left py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceRecords.map((record) => (
                        <tr key={record.id} className="border-b border-zinc-800">
                          <td className="py-3">{record.employeeName}</td>
                          <td>{record.employeeId}</td>
                          <td>{record.checkIn}</td>
                          <td>{record.checkOut || "-"}</td>
                          <td>
                            <span className="text-green-400">{record.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Registered Employees List */}
        {employees.length > 0 && (
          <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-4">
              Registered Employees
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {employees.map((employee) => (
                <div
                  key={employee.id}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex items-center gap-4"
                >
                  <img
                    src={employee.imageUrl}
                    alt={employee.name}
                    className="w-12 h-12 rounded-lg object-cover border border-zinc-700 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{employee.name}</p>
                    <p className="text-zinc-400 text-sm truncate">
                      {employee.department || employee.role || employee.employeeId}
                    </p>
                  </div>
                  <button
                    onClick={() => removeEmployee(employee.id)}
                    className="text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0"
                    title="Remove employee"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #3f3f46; border-radius: 20px; }
      `}</style>
    </div>
  );
}
