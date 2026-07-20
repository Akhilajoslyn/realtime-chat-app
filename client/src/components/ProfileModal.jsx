import { useState, useRef } from 'react';
import api from '../api/axios';
import './chat.css';

export default function ProfileModal({ onClose, onUpdated }) {
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const [preview, setPreview] = useState(currentUser?.avatar_url ? `http://localhost:5000${currentUser.avatar_url}` : null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (uploadRes.data.type !== 'image') {
        alert('Please choose an image file for your profile picture.');
        return;
      }

      const profileRes = await api.put('/auth/profile', { avatar_url: uploadRes.data.url });

      const updatedUser = { ...currentUser, avatar_url: profileRes.data.avatar_url };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setPreview(`http://localhost:5000${profileRes.data.avatar_url}`);
      onUpdated?.();
    } catch (err) {
      console.error('Failed to update profile picture', err);
      alert('Failed to update profile picture');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ width: 320 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="heading-font">Profile picture</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="profile-avatar-preview">
            {preview ? (
              <img src={preview} alt="Profile" />
            ) : (
              <span>{currentUser?.username?.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div style={{ fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}>{currentUser?.username}</div>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button
            className="auth-button"
            style={{ width: 'auto', padding: '10px 20px' }}
            onClick={() => fileInputRef.current.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Change photo'}
          </button>
        </div>
      </div>
    </div>
  );
}