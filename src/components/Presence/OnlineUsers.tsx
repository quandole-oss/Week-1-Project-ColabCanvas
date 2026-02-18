import { UserAvatar } from '../Auth/UserAvatar';
import type { PresenceData, CursorState } from '../../types';

interface OnlineUsersProps {
  users: PresenceData[];
  currentUserId: string;
  remoteCursors?: Map<string, CursorState>;
  presenceConnected?: boolean;
  debugError?: string | null;
}

export function OnlineUsers({ users, currentUserId, remoteCursors }: OnlineUsersProps) {
  return (
    <div className="bg-white/70 backdrop-blur-md rounded-xl p-3 shadow-lg border border-white/20">
      <h3 className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">
        Online ({users.length})
      </h3>
      <div className="flex flex-col gap-2">
        {users.map((user) => {
          const cursor = remoteCursors?.get(user.userId);
          const isEditing = cursor?.selectedObjectIds && cursor.selectedObjectIds.length > 0;

          return (
            <div
              key={user.userId}
              className="flex items-center gap-2"
            >
              <UserAvatar
                name={user.userName}
                color={user.color}
                size="sm"
              />
              <div className="flex flex-col">
                <span className="text-sm text-gray-700">
                  {user.userName}
                  {user.userId === currentUserId && (
                    <span className="text-gray-400 ml-1">(you)</span>
                  )}
                </span>
                {isEditing && user.userId !== currentUserId && (
                  <span className="text-[10px] text-gray-500">
                    Editing an object
                  </span>
                )}
              </div>
              <span
                className={`w-2 h-2 rounded-full ml-auto shadow-sm ${
                  isEditing && user.userId !== currentUserId
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-green-500'
                }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
