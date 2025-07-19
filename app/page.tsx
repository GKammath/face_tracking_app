import ErrorBoundary from './ErrorBoundary';
import FaceTracker from './FaceTracker';

export default function Home() {
  return (
    <ErrorBoundary fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-6 bg-red-100 rounded-lg max-w-md mx-4">
          <h2 className="text-xl font-bold text-red-600 mb-2">Face Tracking Error</h2>
          <p className="text-red-800 mb-4">
            The face tracking feature failed to load. Please try:
          </p>
          <ul className="text-left list-disc pl-5 space-y-1 text-red-800">
            <li>Refreshing the page</li>
            <li>Checking camera permissions</li>
            <li>Using a supported browser (Chrome/Firefox)</li>
          </ul>
        </div>
      </div>
    }>
      <FaceTracker />
    </ErrorBoundary>
  );
}