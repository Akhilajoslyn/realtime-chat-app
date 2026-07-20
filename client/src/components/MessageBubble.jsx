import { useState, useRef } from 'react';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function MessageBubble({ message, isOwn, showSenderName, onDelete, onEdit, onReact, currentUsername }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const hoverTimeoutRef = useRef(null);
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (message.message_type === 'system') {
    return (
      <div style={{ textAlign: 'center', margin: '10px 0' }}>
        <span style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          background: '#EDEFF7',
          padding: '4px 12px',
          borderRadius: 12
        }}>
          {message.content}
        </span>
      </div>
    );
  }

  const renderTicks = () => {
    if (!isOwn) return null;
    if (message.status === 'read') {
      return <span style={{ color: '#00E5A0', fontWeight: 700 }}>✓✓</span>;
    }
    return <span style={{ opacity: 0.7 }}>✓</span>;
  };

  const isDeleted = message.is_deleted;
  const canEdit = isOwn && !isDeleted && !message.attachment_url;

  const saveEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      setEditText(message.content);
      return;
    }
    onEdit(message.id, trimmed);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditText(message.content);
    }
  };

  // Group reactions by emoji: { '👍': ['alice', 'bob'], '❤️': ['john'] }
  const groupedReactions = (message.reactions || []).reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r.username);
    return acc;
  }, {});

  const myReaction = (message.reactions || []).find((r) => r.username === currentUsername)?.emoji;

  const handleEmojiClick = (emoji) => {
    onReact(message.id, emoji);
    setShowEmojiPicker(false);
    setShowMenu(false);
  };

  return (
    <div
      className={`message-row ${isOwn ? "own" : "other"}`}
      style={{
        position: "relative",
        marginBottom: Object.keys(groupedReactions).length > 0 ? 18 : 6,
      }}
      onMouseEnter={() => {
        clearTimeout(hoverTimeoutRef.current);
        if (!isDeleted && !isEditing) setShowMenu(true);
      }}
      onMouseLeave={() => {
        hoverTimeoutRef.current = setTimeout(() => {
          setShowMenu(false);
          setShowEmojiPicker(false);
        }, 300);
      }}
    >
      {showMenu && !isDeleted && !isEditing && (
        <div
          className={`message-menu-trigger ${isOwn ? "own" : "other"}`}
          onMouseEnter={() => clearTimeout(hoverTimeoutRef.current)}
          onMouseLeave={() => {
            hoverTimeoutRef.current = setTimeout(() => {
              setShowMenu(false);
              setShowEmojiPicker(false);
            }, 300);
          }}
        >
          <button
            className="message-menu-btn"
            title="React"
            onClick={() => setShowEmojiPicker((p) => !p)}
          >
            😊
          </button>
          <button
            className="message-menu-btn"
            onClick={() => setShowMenu("open")}
          >
            ⋮
          </button>

          {showEmojiPicker && (
            <div className={`emoji-picker ${isOwn ? "own" : "other"}`}>
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  className={`emoji-picker-btn ${myReaction === e ? "active" : ""}`}
                  onClick={() => handleEmojiClick(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          {showMenu === "open" && (
            <div className="message-menu-dropdown">
              {canEdit && (
                <div
                  className="message-menu-item"
                  onClick={() => {
                    setIsEditing(true);
                    setShowMenu(false);
                  }}
                >
                  Edit
                </div>
              )}
              <div
                className="message-menu-item"
                onClick={() => {
                  onDelete(message.id, "me");
                  setShowMenu(false);
                }}
              >
                Delete for me
              </div>
              {isOwn && (
                <div
                  className="message-menu-item danger"
                  onClick={() => {
                    onDelete(message.id, "everyone");
                    setShowMenu(false);
                  }}
                >
                  Delete for everyone
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div
        className={`message-bubble ${isOwn ? "own" : "other"} ${isDeleted ? "deleted" : ""}`}
      >
        {!isOwn && showSenderName && !isDeleted && (
          <div className="message-sender">{message.sender_name}</div>
        )}

        {!isDeleted &&
          message.attachment_url &&
          (message.attachment_type === "image" ? (
            <img
              src={`http://localhost:5000${message.attachment_url}`}
              alt={message.attachment_name}
              style={{
                maxWidth: 220,
                borderRadius: 10,
                display: "block",
                marginBottom: message.content ? 6 : 2,
                cursor: "pointer",
              }}
              onClick={() =>
                window.open(
                  `http://localhost:5000${message.attachment_url}`,
                  "_blank",
                )
              }
            />
          ) : (
            <a
              href={`http://localhost:5000${message.attachment_url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="attachment-file-card"
            >
              📄 {message.attachment_name}
            </a>
          ))}

        {isEditing ? (
          <div className="edit-message-box">
            <input
              autoFocus
              className="edit-message-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleEditKeyDown}
            />
            <div className="edit-message-actions">
              <button
                className="edit-cancel-btn"
                onClick={() => {
                  setIsEditing(false);
                  setEditText(message.content);
                }}
              >
                Cancel
              </button>
              <button className="edit-save-btn" onClick={saveEdit}>
                Save
              </button>
            </div>
          </div>
        ) : (
          (isDeleted || message.content) && (
            <div style={isDeleted ? { fontStyle: "italic", opacity: 0.7 } : {}}>
              {message.content}
              {Boolean(message.is_edited) && !isDeleted && (
                <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 6 }}>
                  (edited)
                </span>
              )}
            </div>
          )
        )}

        <div className="message-time">
          {time} {renderTicks()}
        </div>

        {Object.keys(groupedReactions).length > 0 && (
          <div className={`reaction-bar ${isOwn ? "own" : "other"}`}>
            {Object.entries(groupedReactions).map(([emoji, usernames]) => (
              <button
                key={emoji}
                className={`reaction-pill ${usernames.includes(currentUsername) ? "active" : ""}`}
                title={usernames.join(", ")}
                onClick={() => onReact(message.id, emoji)}
              >
                {emoji} <span>{usernames.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}