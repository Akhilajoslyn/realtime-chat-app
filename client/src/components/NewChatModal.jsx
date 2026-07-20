import { useState, useEffect } from 'react';
import api from '../api/axios';
import Avatar from './Avatar';
import './chat.css';

export default function NewChatModal({ onClose, onConversationCreated }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('direct'); // 'direct' | 'group'
  const [selectedIds, setSelectedIds] = useState([]);
  const [groupName, setGroupName] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err) {
      console.error('Failed to load users', err);
    } finally {
      setLoading(false);
    }
  };

  const startDirectConversation = async (otherUser) => {
    try {
      const res = await api.post('/conversations', {
        type: 'direct',
        name: null,
        memberIds: [otherUser.id]
      });
      onConversationCreated(res.data.conversationId, otherUser);
    } catch (err) {
      console.error('Failed to create conversation', err);
    }
  };

  const toggleSelect = (userId) => {
    setSelectedIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const createGroup = async () => {
    if (!groupName.trim() || selectedIds.length < 2) return;
    try {
      const res = await api.post('/conversations', {
        type: 'group',
        name: groupName.trim(),
        memberIds: selectedIds
      });
      onConversationCreated(res.data.conversationId, { username: groupName.trim() });
    } catch (err) {
      console.error('Failed to create group', err);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="heading-font">{mode === 'direct' ? 'Start a new chat' : 'Create a group'}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-tabs">
          <button
            className={`modal-tab ${mode === 'direct' ? 'active' : ''}`}
            onClick={() => setMode('direct')}
          >
            Direct
          </button>
          <button
            className={`modal-tab ${mode === 'group' ? 'active' : ''}`}
            onClick={() => setMode('group')}
          >
            Group
          </button>
        </div>

        {mode === 'group' && (
          <div className="modal-group-name">
            <input
              className="auth-input"
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>
        )}

        <div className="modal-body">
          {loading && <p className="sidebar-empty" style={{ color: 'var(--text-muted)' }}>Loading users...</p>}
          {!loading && users.length === 0 && (
            <p className="sidebar-empty" style={{ color: 'var(--text-muted)' }}>No other users found yet.</p>
          )}
          {users.map((u) => (
            <div
              key={u.id}
              className="modal-user-item"
              onClick={() => (mode === 'direct' ? startDirectConversation(u) : toggleSelect(u.id))}
            >
              {mode === 'group' && (
                <input
                  type="checkbox"
                  checked={selectedIds.includes(u.id)}
                  onChange={() => toggleSelect(u.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
              <Avatar name={u.username} avatarUrl={u.avatar_url} />
              <div>
                <div className="conversation-name" style={{ color: 'var(--text-dark)' }}>{u.username}</div>
                <div style={{ fontSize: 12, color: u.is_online ? 'var(--online)' : 'var(--text-muted)' }}>
                  {u.is_online ? 'Online' : 'Offline'}
                </div>
              </div>
            </div>
          ))}
        </div>

        {mode === 'group' && (
          <div className="modal-footer">
            <button
              className="auth-button"
              onClick={createGroup}
              disabled={!groupName.trim() || selectedIds.length < 2}
            >
              Create group ({selectedIds.length} selected)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}