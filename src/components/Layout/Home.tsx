import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../hooks/useAuth';
import { UserAvatar } from '../Auth/UserAvatar';

export function Home() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');

  if (!user) return null;

  const handleCreateRoom = () => {
    const newRoomId = uuidv4().replace(/-/g, '').slice(0, 16);
    navigate(`/room/${newRoomId}`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/room/${roomId.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 rounded-lg p-8 w-full max-w-md">
        {/* User info */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <UserAvatar
              name={user.displayName || 'Anonymous'}
              color={user.color}
              photoURL={user.photoURL}
              size="lg"
            />
            <div>
              <p className="text-white font-medium">{user.displayName}</p>
              <p className="text-gray-400 text-sm">{user.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition"
          >
            Sign Out
          </button>
        </div>

        <h1 className="text-2xl font-bold text-white mb-6 text-center">
          Collaborative Canvas
        </h1>

        {/* Create room */}
        <button
          onClick={handleCreateRoom}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition mb-6"
        >
          Create New Room
        </button>

        {/* Divider */}
        <div className="flex items-center mb-6">
          <div className="flex-1 border-t border-gray-600"></div>
          <span className="px-4 text-gray-400 text-sm">or join existing</span>
          <div className="flex-1 border-t border-gray-600"></div>
        </div>

        {/* Join room */}
        <form onSubmit={handleJoinRoom}>
          <label htmlFor="room-id" className="sr-only">Room ID</label>
          <div className="flex gap-2">
            <input
              id="room-id"
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder={"Enter room ID\u2026"}
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent"
            />
            <button
              type="submit"
              disabled={!roomId.trim()}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded transition"
            >
              Join
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
