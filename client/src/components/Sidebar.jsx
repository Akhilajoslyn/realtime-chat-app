import { useSocket } from '../context/SocketContext';
import { useEffect, useState } from 'react';
import NewChatModal from './NewChatModal';
import GlobalSearchPanel from './GlobalSearchPanel';
import ProfileModal from './ProfileModal';
import Avatar from './Avatar';
import './chat.css';

export default function Sidebar({ conversations, activeConversation, onSelectConversation, onConversationCreated, onDeleteConversation }) {
  const currentUser = JSON.parse(localStorage.getItem('user'));
  const socket = useSocket();
  const [onlineStatus, setOnlineStatus] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    if (!socket) return;
    const handleStatus = ({ userId, isOnline }) => {
      setOnlineStatus((prev) => ({ ...prev, [userId]: isOnline }));
    };
    socket.on('user:status', handleStatus);
    return () => socket.off('user:status', handleStatus);
  }, [socket]);

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/login';
  };

  const getDisplayName = (conv) =>
    conv.type === 'group' ? conv.name : (conv.other_username || `Conversation #${conv.id}`);

  // Filter by name (case-insensitive) across both groups and direct chats
  const filtered = conversations.filter((c) =>
    getDisplayName(c).toLowerCase().includes(filterText.toLowerCase())
  );

  const directChats = filtered.filter((c) => c.type === 'direct');
  const groupChats = filtered.filter((c) => c.type === 'group');

  const renderConversationItem = (conv) => {
    const isOnline = onlineStatus[conv.other_user_id] ?? conv.other_is_online;
    const displayName = getDisplayName(conv);
    const isActive = activeConversation?.id === conv.id;
    const hasUnread = !isActive && conv.unread_count > 0;

    return (
      <div
        key={conv.id}
        onClick={() => onSelectConversation(conv)}
        className={`conversation-item ${isActive ? 'active' : ''}`}
        onMouseEnter={() => setHoveredId(conv.id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        <div className="conversation-avatar-wrap">
          <Avatar name={displayName} avatarUrl={conv.type === 'direct' ? conv.other_avatar_url : null} />
          {conv.type === 'direct' && (
            <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
          )}
        </div>
        <div className="conversation-info">
          <div className="conversation-name">{displayName}</div>
          <div className="conversation-preview">
            {conv.last_message || (conv.type === 'group' ? `${conv.member_count} members` : 'No messages yet')}
          </div>
        </div>
        {hasUnread && <span className="unread-badge">{conv.unread_count}</span>}
        {hoveredId === conv.id && !hasUnread && conv.type === 'direct' && (
          <button
            className="conversation-delete-btn"
            title="Delete chat"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteConversation(conv);
            }}
          >
            🗑️
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-user" onClick={() => setShowProfile(true)} style={{ cursor: 'pointer' }}>
          <Avatar name={currentUser?.username} avatarUrl={currentUser?.avatar_url} />
          <span className="sidebar-username">{currentUser?.username}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="new-chat-btn" onClick={() => setShowModal(true)} title="New chat">+</button>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      <div className="sidebar-search-row">
        <input
          className="sidebar-filter-input"
          placeholder="Search chats..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <button
          className="sidebar-global-search-btn"
          onClick={() => setShowGlobalSearch(true)}
          title="Search all messages"
        >
          🔍
        </button>
      </div>

      <div className="conversation-list">
        {conversations.length === 0 && (
          <p className="sidebar-empty">No conversations yet — start one to see it here.</p>
        )}

        {conversations.length > 0 && filtered.length === 0 && (
          <p className="sidebar-empty">No chats match "{filterText}"</p>
        )}

        {groupChats.length > 0 && (
          <>
            <div className="section-label">Groups</div>
            {groupChats.map(renderConversationItem)}
          </>
        )}

        {directChats.length > 0 && (
          <>
            <div className="section-label">Direct messages</div>
            {directChats.map(renderConversationItem)}
          </>
        )}
      </div>

      {showModal && (
        <NewChatModal
          onClose={() => setShowModal(false)}
          onConversationCreated={(conversationId, otherUser) => {
            setShowModal(false);
            onConversationCreated(conversationId, otherUser);
          }}
        />
      )}

      {showGlobalSearch && (
        <GlobalSearchPanel
          conversations={conversations}
          onClose={() => setShowGlobalSearch(false)}
          onOpenConversation={onSelectConversation}
        />
      )}

      {showProfile && (
        <ProfileModal
          onClose={() => setShowProfile(false)}
          onUpdated={() => window.location.reload()}
        />
      )}
    </div>
  );
}