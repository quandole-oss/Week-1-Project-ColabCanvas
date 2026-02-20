import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { isFirebaseConfigured } from '../../services/firebase';

export function LoginForm() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, signInAsDemo } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [demoName, setDemoName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUpWithEmail(email, password, displayName);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (demoName.trim()) {
      signInAsDemo(demoName.trim());
    }
  };

  // Demo mode UI when Firebase is not configured
  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100">
        <div className="bg-white/70 backdrop-blur-md p-8 rounded-2xl shadow-xl w-full max-w-md border border-white/30">
          <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">
            Collaborative Canvas
          </h1>
          <p className="text-gray-500 mb-2 text-center">
            Design together in real-time
          </p>

          <div className="bg-amber-100/80 border border-amber-300/50 text-amber-700 px-4 py-3 rounded-xl mb-6 text-sm">
            <strong>Demo Mode:</strong> Firebase is not configured. You can still test the canvas and AI features locally.
          </div>

          <form onSubmit={handleDemoSignIn} className="space-y-4">
            <div>
              <label htmlFor="demo-name" className="block text-gray-600 text-sm mb-1 font-medium">
                Your Name
              </label>
              <input
                id="demo-name"
                type="text"
                value={demoName}
                onChange={(e) => setDemoName(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/50 border border-white/30 rounded-xl text-gray-800 placeholder-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50 focus-visible:border-transparent"
                placeholder={"Enter your name\u2026"}
                required
                autoFocus
                autoComplete="name"
              />
            </div>

            <button
              type="submit"
              disabled={!demoName.trim()}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition shadow-lg"
            >
              Enter Demo Mode
            </button>
          </form>

          <div className="mt-6 p-4 bg-white/40 rounded-xl text-sm text-gray-600 border border-white/30">
            <p className="font-medium text-gray-700 mb-2">In demo mode you can:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Create and manipulate shapes</li>
              <li>Use AI commands to generate objects</li>
              <li>Test pan, zoom, and all tools</li>
            </ul>
            <p className="mt-2 text-gray-500">
              Note: Real-time sync with other users requires Firebase configuration.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Normal Firebase auth UI
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">
          Collaborative Canvas
        </h1>
        <p className="text-gray-400 mb-6 text-center">
          Design together in real-time
        </p>

        <div aria-live="polite">
          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-2 rounded mb-4" role="alert">
              {error}
            </div>
          )}
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <label htmlFor="display-name" className="block text-gray-300 text-sm mb-1">
                Display Name
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent"
                placeholder={"Your name\u2026"}
                required={isSignUp}
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-gray-300 text-sm mb-1">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent"
              placeholder="you@example.com"
              required
              autoComplete="email"
              spellCheck={false}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-gray-300 text-sm mb-1">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent"
              placeholder="********"
              required
              minLength={6}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading\u2026' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div className="my-6 flex items-center">
          <div className="flex-1 border-t border-gray-600"></div>
          <span className="px-4 text-gray-400 text-sm">or</span>
          <div className="flex-1 border-t border-gray-600"></div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-2 bg-white hover:bg-gray-100 text-gray-800 font-medium rounded flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        <p className="mt-6 text-center text-gray-400 text-sm">
          {isSignUp ? 'Already have an account?' : 'Don\u2019t have an account?'}{' '}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-blue-400 hover:underline"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}
