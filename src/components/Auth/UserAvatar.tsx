interface UserAvatarProps {
  name: string;
  color: string;
  photoURL?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
};

export function UserAvatar({
  name,
  color,
  photoURL,
  size = 'md',
  showName = false,
}: UserAvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-2">
      {photoURL ? (
        <img
          src={photoURL}
          alt={name}
          className={`${sizeClasses[size]} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-medium text-white`}
          style={{ backgroundColor: color }}
        >
          {initials}
        </div>
      )}
      {showName && <span className="text-white text-sm">{name}</span>}
    </div>
  );
}
