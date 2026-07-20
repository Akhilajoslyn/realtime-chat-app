import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import api from '../api/axios';
import MessageBubble from './MessageBubble';
import './chat.css';
import GroupInfoModal from './GroupInfoModal';
import SearchPanel from './SearchPanel';
import EmojiPicker from './EmojiPicker';
import Avatar from './Avatar';

export default function ChatWindow({ conversation, onLeaveGroup, onConversationsRefresh }) {
  const socket = useSocket();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [highlightedId, setHighlightedId] = useState(null);
  const messageRefs = useRef({});
  const bottomRef = useRef(null);

  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const typingTimeoutRef = useRef(null);
  const currentUser = JSON.parse(localStorage.getItem('user'));

  const displayName = conversation.type === 'group' ? conversation.name : (conversation.other_username || `Conversation #${conversation.id}`);

  useEffect(() => {
    fetchMessages();
    setOtherTyping(false);

    if (socket) {
      socket.emit('messages:read', { conversationId: conversation.id });
    }
  }, [conversation.id, socket]);

  useEffect(() => {
    if (!socket) return;

    const handleReceive = (message) => {
      if (message.conversation_id === conversation.id) {
        setMessages((prev) => [...prev, message]);
        if (message.sender_id !== currentUser.id) {
          socket.emit('messages:read', { conversationId: conversation.id });
        }
      }
    };

    const handleTyping = ({ conversationId, userId, typing }) => {
      if (conversationId === conversation.id && userId !== currentUser.id) {
        setOtherTyping(typing);
      }
    };

    const handleReadUpdate = ({ conversationId }) => {
      if (conversationId === conversation.id) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.sender_id === currentUser.id ? { ...msg, status: 'read' } : msg
          )
        );
      }
    };

    const handleDeleted = ({ conversationId, messageId }) => {
      if (conversationId === conversation.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, is_deleted: true, content: 'This message was deleted' } : m
          )
        );
      }
    };

    const handleEditUpdate = ({ conversationId, messageId, content }) => {
      if (conversationId === conversation.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, content, is_edited: true } : m,
          ),
        );
      }
    };

    const handleReactionUpdate = ({ conversationId, messageId, reactions }) => {
      if (conversationId === conversation.id) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
        );
      }
    };

    const handleBlockedUpdate = ({ conversationId }) => {
      if (conversationId === conversation.id) {
        onConversationsRefresh?.();
      }
    };

    socket.on('conversation:blocked-updated', handleBlockedUpdate);
    socket.on('reaction:update', handleReactionUpdate);
    socket.on('message:edit-update', handleEditUpdate);
    socket.on('message:receive', handleReceive);
    socket.on('typing:update', handleTyping);
    socket.on('messages:read-update', handleReadUpdate);
    socket.on('message:deleted', handleDeleted);

    return () => {
      socket.off('message:receive', handleReceive);
      socket.off('typing:update', handleTyping);
      socket.off('messages:read-update', handleReadUpdate);
      socket.off('message:deleted', handleDeleted);
      socket.off('message:edit-update', handleEditUpdate);
      socket.off('reaction:update', handleReactionUpdate);
      socket.off('conversation:blocked-updated', handleBlockedUpdate);
    };
  }, [socket, conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, otherTyping]);

  const fetchMessages = async () => {
    try {
      const res = await api.get(`/conversations/${conversation.id}/messages`);
      setMessages(res.data);
    } catch (err) {
      console.error('Failed to load messages', err);
    }
  };

  const sendMessage = () => {
    if ((!input.trim() && !attachment) || !socket) return;
    socket.emit('message:send', {
      conversationId: conversation.id,
      content: input,
      attachment: attachment ? { url: attachment.url, type: attachment.type, name: attachment.name } : null
    });
    socket.emit('typing:stop', { conversationId: conversation.id });
    setInput('');
    setAttachment(null);
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') sendMessage();
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!socket) return;
    socket.emit('typing:start', { conversationId: conversation.id });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', { conversationId: conversation.id });
    }, 1500);
  };

  const handleDeleteMessage = async (messageId, mode) => {
    try {
      await api.delete(`/messages/${messageId}`, { data: { mode } });

      if (mode === 'me') {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } else {
        socket.emit('message:delete-everyone', { conversationId: conversation.id, messageId });
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, is_deleted: true, content: 'This message was deleted' } : m))
        );
      }
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  };

  const handleEditMessage = async (messageId, newContent) => {
    try {
      await api.put(`/messages/${messageId}`, { content: newContent });
      socket.emit('message:edited', { conversationId: conversation.id, messageId, content: newContent });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: newContent, is_edited: true } : m))
      );
    } catch (err) {
      console.error('Failed to edit message', err);
      alert(err.response?.data?.message || 'Failed to edit message');
    }
  };

  const jumpToMessage = async (messageId) => {
    setShowSearch(false);

    if (messages.some((m) => m.id === messageId)) {
      scrollToMessage(messageId);
      return;
    }

    try {
      const res = await api.get(`/conversations/${conversation.id}/messages/${messageId}/context`);
      setMessages(res.data.messages);
      setTimeout(() => scrollToMessage(res.data.targetMessageId), 100);
    } catch (err) {
      console.error('Failed to load message context', err);
    }
  };

  const scrollToMessage = (messageId) => {
    const el = messageRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedId(messageId);
      setTimeout(() => setHighlightedId(null), 2000);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAttachment({
        url: res.data.url,
        type: res.data.type,
        name: res.data.name,
        previewUrl: res.data.type === 'image' ? URL.createObjectURL(file) : null
      });
    } catch (err) {
      console.error('Upload failed', err);
      alert(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleReact = async (messageId, emoji) => {
    try {
      const res = await api.post(`/messages/${messageId}/reactions`, { emoji });
      socket.emit('reaction:toggle', {
        conversationId: conversation.id,
        messageId,
        reactions: res.data.reactions,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, reactions: res.data.reactions } : m,
        ),
      );
    } catch (err) {
      console.error('Failed to react', err);
    }
  };

  const handleEmojiSelect = (emoji) => {
    setInput((prev) => prev + emoji);
  };

  const handleBlockToggle = async () => {
    const isBlocked = conversation.i_blocked_them;
    const confirmed = window.confirm(
      isBlocked
        ? `Unblock ${displayName}? They'll be able to message you again.`
        : `Block ${displayName}? Neither of you will be able to send messages until you unblock.`
    );
    if (!confirmed) return;

    try {
      if (isBlocked) {
        await api.delete(`/users/${conversation.other_user_id}/block`);
      } else {
        await api.post(`/users/${conversation.other_user_id}/block`);
      }
      socket.emit(isBlocked ? 'user:unblocked' : 'user:blocked', { conversationId: conversation.id });
      onConversationsRefresh?.();
    } catch (err) {
      console.error('Failed to toggle block', err);
    }
  };

  return (
    <div className="chat-window" style={{ position: "relative" }}>
      <div
        className="chat-header"
        style={{
          cursor: conversation.type === "group" ? "pointer" : "default",
        }}
      >
        <div
          onClick={() =>
            conversation.type === "group" && setShowGroupInfo(true)
          }
          style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}
        >
          <Avatar name={displayName} avatarUrl={conversation.type === 'direct' ? conversation.other_avatar_url : null} />
          <div>
            <div className="chat-header-name">{displayName}</div>
            {otherTyping && <div className="chat-header-status">typing...</div>}
          </div>
        </div>
        {conversation.type === "direct" && (
          <button
            className="modal-close"
            style={{
              fontSize: 13,
              color: conversation.i_blocked_them ? "var(--online)" : "#E4536B",
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleBlockToggle();
            }}
            title={conversation.i_blocked_them ? "Unblock" : "Block"}
          >
            {conversation.i_blocked_them ? "Unblock" : "Block"}
          </button>
        )}
        <button
          className="modal-close"
          style={{ fontSize: 18 }}
          onClick={(e) => {
            e.stopPropagation();
            setShowSearch(true);
          }}
          title="Search messages"
        >
          🔍
        </button>
        {showGroupInfo && (
          <GroupInfoModal
            conversation={conversation}
            onClose={() => setShowGroupInfo(false)}
            onLeft={(systemMessage) => {
              setShowGroupInfo(false);
              if (systemMessage)
                setMessages((prev) => [...prev, systemMessage]);
              onLeaveGroup?.();
            }}
          />
        )}

        {showSearch && (
          <SearchPanel
            conversationId={conversation.id}
            onClose={() => setShowSearch(false)}
            onJumpToMessage={jumpToMessage}
          />
        )}
      </div>

      <div className="messages-area">
        {messages.map((msg) => (
          <div
            key={msg.id}
            ref={(el) => (messageRefs.current[msg.id] = el)}
            style={{
              transition: "background-color 0.3s ease",
              backgroundColor:
                highlightedId === msg.id ? "#FFF3CD" : "transparent",
              borderRadius: 10,
            }}
          >
            <MessageBubble
              message={msg}
              isOwn={msg.sender_id === currentUser.id}
              showSenderName={conversation.type === "group"}
              onDelete={handleDeleteMessage}
              onEdit={handleEditMessage}
              onReact={handleReact}
              currentUsername={currentUser.username}
            />
          </div>
        ))}
        {otherTyping && <div className="typing-indicator">typing...</div>}
        <div ref={bottomRef} />
      </div>

      <div className="message-input-bar">
        {conversation.my_left_at ? (
          <div
            style={{
              flex: 1,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              padding: 10,
            }}
          >
            You left this group
          </div>
        ) : conversation.i_blocked_them || conversation.they_blocked_me ? (
          <div
            style={{
              flex: 1,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              padding: 10,
            }}
          >
            {conversation.i_blocked_them
              ? "You have blocked this user"
              : "You cannot message this user"}
          </div>
        ) : (
          <>
            {attachment && (
              <div className="attachment-preview">
                {attachment.type === "image" ? (
                  <img
                    src={attachment.previewUrl}
                    alt="preview"
                    className="attachment-preview-img"
                  />
                ) : (
                  <div className="attachment-preview-file">
                    📄 {attachment.name}
                  </div>
                )}
                <button
                  className="attachment-remove-btn"
                  onClick={() => setAttachment(null)}
                >
                  ✕
                </button>
              </div>
            )}

            {showEmojiPicker && (
              <EmojiPicker
                onSelect={handleEmojiSelect}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                width: "100%",
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />

              <button
                className="attach-btn"
                onClick={() => fileInputRef.current.click()}
                disabled={uploading}
                title="Attach file"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>

              <button
                className="attach-btn"
                onClick={() => setShowEmojiPicker((p) => !p)}
                title="Emoji"
              >
                😊
              </button>

              <input
                className="message-input"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={uploading ? "Uploading..." : "Type a message..."}
                disabled={uploading}
              />

              <button
                className="send-btn"
                onClick={sendMessage}
                disabled={(!input.trim() && !attachment) || uploading}
              >
                ➤
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}