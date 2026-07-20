export default function Avatar({ name, avatarUrl, size = 38 }) {
  const initial = name?.charAt(0).toUpperCase() || '?';

  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {avatarUrl ? (
        <img src={`http://localhost:5000${avatarUrl}`} alt={name} className="avatar-img" />
      ) : (
        initial
      )}
    </div>
  );
}