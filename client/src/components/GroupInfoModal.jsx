import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useSocket } from '../context/SocketContext';
import Avatar from './Avatar';
import './chat.css';

export default function GroupInfoModal({ conversation, onClose, onLeft }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const socket = useSocket();
  const currentUser = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = ({ conversationId }) => {
      if (conversationId === conversation.id) fetchMembers();
    };
    socket.on('group:updated', handleUpdate);
    return () => socket.off('group:updated', handleUpdate);
  }, [socket]);

  const fetchMembers = async () => {
    try {
      const res = await api.get(`/conversations/${conversation.id}/members`);
      setMembers(res.data);
    } catch (err) {
      console.error('Failed to load members', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddPicker = async () => {
    try {
      const res = await api.get('/users');
      const memberIds = members.map((m) => m.id);
      setAllUsers(res.data.filter((u) => !memberIds.includes(u.id)));
      setShowAddPicker(true);
    } catch (err) {
      console.error('Failed to load users', err);
    }
  };

  const toggleSelect = (userId) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const confirmAddMembers = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await api.post(`/conversations/${conversation.id}/members`, { memberIds: selectedIds });
      socket?.emit('group:member-added', {
        conversationId: conversation.id,
        addedUserIds: selectedIds,
        systemMessages: res.data.systemMessages
      });
      setSelectedIds([]);
      setShowAddPicker(false);
      fetchMembers();
    } catch (err) {
      console.error('Failed to add members', err);
    }
  };

  const handleLeaveGroup = async () => {
    const confirmed = window.confirm(`Leave "${conversation.name}"? You won't see new messages, but your chat history stays.`);
    if (!confirmed) return;
    try {
      const res = await api.delete(`/conversations/${conversation.id}/leave`);
      socket?.emit('group:member-left', {
        conversationId: conversation.id,
        systemMessage: res.data.systemMessage
      });
      onLeft(res.data.systemMessage);
    } catch (err) {
      console.error('Failed to leave group', err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="heading-font">{showAddPicker ? 'Add members' : conversation.name}</span>
          <button className="modal-close" onClick={() => (showAddPicker ? setShowAddPicker(false) : onClose())}>
            {showAddPicker ? '←' : '✕'}
          </button>
        </div>

        {!showAddPicker && (
          <>
            <div className="modal-body">
              {loading && <p className="sidebar-empty" style={{ color: 'var(--text-muted)' }}>Loading members...</p>}
              {!loading && (
                <p style={{ padding: '0 12px 8px', fontSize: 12, color: 'var(--text-muted)' }}>
                  {members.length} members
                </p>
              )}
              {members.map((m) => (
                <div key={m.id} className="modal-user-item" style={{ cursor: 'default' }}>
                  <Avatar name={m.username} avatarUrl={m.avatar_url} />
                  <div>
                    <div className="conversation-name" style={{ color: 'var(--text-dark)' }}>
                      {m.username} {m.id === currentUser.id && <span style={{ color: 'var(--text-muted)' }}>(you)</span>}
                    </div>
                    <div style={{ fontSize: 12, color: m.is_online ? 'var(--online)' : 'var(--text-muted)' }}>
                      {m.is_online ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 8 }}>
              <button className="auth-button" style={{ background: 'var(--accent)' }} onClick={openAddPicker}>
                Add members
              </button>
              <button
                className="auth-button"
                style={{ background: '#E4536B' }}
                onClick={handleLeaveGroup}
              >
                Leave group
              </button>
            </div>
          </>
        )}

        {showAddPicker && (
          <>
            <div className="modal-body">
              {allUsers.length === 0 && (
                <p className="sidebar-empty" style={{ color: 'var(--text-muted)' }}>Everyone is already in this group.</p>
              )}
              {allUsers.map((u) => (
                <div key={u.id} className="modal-user-item" onClick={() => toggleSelect(u.id)}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(u.id)}
                    onChange={() => toggleSelect(u.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Avatar name={u.username} avatarUrl={u.avatar_url} />
                  <div className="conversation-name" style={{ color: 'var(--text-dark)' }}>{u.username}</div>
                </div>
              ))}
            </div>
            {allUsers.length > 0 && (
              <div className="modal-footer">
                <button
                  className="auth-button"
                  onClick={confirmAddMembers}
                  disabled={selectedIds.length === 0}
                >
                  Add ({selectedIds.length})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}