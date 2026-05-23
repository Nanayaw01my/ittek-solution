import React, { useState, useRef, useCallback, useEffect } from 'react'
import Webcam from 'react-webcam'

export default function CameraCapture({ onCapture, label, required = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const [capturedImage, setCapturedImage] = useState(null)
  const [cameraError, setCameraError] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [facingMode, setFacingMode] = useState('environment')
  const webcamRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    setIsMobile(mobile)
  }, [])

  const videoConstraints = {
    facingMode: facingMode,
    width: { ideal: 1280 },
    height: { ideal: 720 },
  }

  const handleCapture = useCallback(() => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot()
      if (imageSrc) {
        setCapturedImage(imageSrc)
        setIsOpen(false)
        onCapture(imageSrc)
      }
    }
  }, [onCapture])

  const handleRetake = () => {
    setCapturedImage(null)
    onCapture(null)
    setIsOpen(true)
  }

  const handleCameraError = () => {
    setCameraError(true)
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result
      setCapturedImage(dataUrl)
      onCapture(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')
  }

  if (cameraError) {
    return (
      <div className="w-full">
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {capturedImage ? (
          <div className="relative">
            <img
              src={capturedImage}
              alt="Captured"
              className="w-full h-48 object-cover rounded-2xl border-2 border-green-300"
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => { setCapturedImage(null); onCapture(null); fileInputRef.current?.click() }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors"
              >
                Change Photo
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-40 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-green-500 hover:bg-green-50 transition-colors"
            >
              <svg className="w-10 h-10 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-gray-500 font-medium">Tap to upload photo</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG supported</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-full">
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {capturedImage ? (
        <div className="relative">
          <img
            src={capturedImage}
            alt="Captured"
            className="w-full h-48 object-cover rounded-2xl border-2 border-green-400"
          />
          <div className="absolute top-2 right-2 bg-green-600 rounded-full p-1">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <button
            type="button"
            onClick={handleRetake}
            className="mt-2 w-full py-2.5 px-4 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retake Photo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full h-40 border-2 border-dashed border-green-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-green-500 hover:bg-green-50 transition-colors"
        >
          <svg className="w-12 h-12 text-green-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm font-semibold text-green-700">Take Photo</p>
          <p className="text-xs text-gray-500 mt-1">Tap to open camera</p>
        </button>
      )}

      {/* Camera Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4 pt-safe">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-white p-2 rounded-full hover:bg-white hover:bg-opacity-20 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <p className="text-white font-semibold text-sm">{label}</p>
            {isMobile && (
              <button
                type="button"
                onClick={toggleCamera}
                className="text-white p-2 rounded-full hover:bg-white hover:bg-opacity-20 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.85}
              videoConstraints={videoConstraints}
              onUserMediaError={handleCameraError}
              className="w-full h-full object-cover"
              style={{ maxHeight: 'calc(100vh - 200px)' }}
            />
          </div>

          {/* Capture button area */}
          <div className="p-8 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={handleCapture}
              className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <div className="w-16 h-16 rounded-full bg-green-800 flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </button>
            <p className="text-white text-sm opacity-75">Tap to capture</p>

            {/* Fallback file upload */}
            <button
              type="button"
              onClick={() => { setIsOpen(false); fileInputRef.current?.click() }}
              className="text-white text-sm underline opacity-60"
            >
              Upload from gallery instead
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
