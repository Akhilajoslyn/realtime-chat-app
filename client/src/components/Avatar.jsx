export default function Avatar({ name, avatarUrl, size = 38 }) {
  const initial = name?.charAt(0).toUpperCase() || '?';

  // Support both Cloudinary URLs and old local upload paths
  let imageSrc = null;

  if (avatarUrl) {
    if (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://')) {
      imageSrc = avatarUrl;
    } else {
      imageSrc = `${import.meta.env.VITE_API_URL}${avatarUrl}`;
    }
  }

  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
      }}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={name}
          className="avatar-img"
        />
      ) : (
        initial
      )}
    </div>
  );
}