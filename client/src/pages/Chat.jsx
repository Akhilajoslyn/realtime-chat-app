import { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import api from '../api/axios';
import { useSocket } from '../context/SocketContext';
import '../components/chat.css';

export default function Chat() {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const socket = useSocket();

  useEffect(() => {
    fetchConversations();
  }, []);

  // Refresh conversation list (for unread counts / last message) whenever relevant events happen
  useEffect(() => {
  if (!socket) return;

  const refresh = () => fetchConversations();

  socket.on('message:receive', refresh);
  socket.on('messages:read-update', refresh);
  socket.on('conversation:new', refresh);

  return () => {
    socket.off('message:receive', refresh);
    socket.off('messages:read-update', refresh);
    socket.off('conversation:new', refresh);
  };
}, [socket]);

  const fetchConversations = async () => {
  try {
    const res = await api.get('/conversations');
    setConversations(res.data);
    // Keep the currently open conversation in sync with fresh data (e.g. block status)
    setActiveConversation((prev) => {
      if (!prev) return prev;
      const updated = res.data.find((c) => c.id === prev.id);
      return updated || prev;
    });
  } catch (err) {
    console.error('Failed to load conversations', err);
  }
};

  const handleConversationCreated = async (conversationId, otherUser) => {
    const res = await api.get('/conversations');
    setConversations(res.data);
    const newConv = res.data.find((c) => c.id === conversationId);
    setActiveConversation(newConv || { id: conversationId, other_username: otherUser.username, type: 'direct' });
  };

  const handleSelectConversation = (conv) => {
    setActiveConversation(conv);
    // Optimistically zero out unread count locally right away, so the badge
    // disappears instantly instead of waiting on the server round-trip
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
    );
  };

  const handleLeaveGroup = () => {
  setActiveConversation(null);
  fetchConversations(); // refresh sidebar so the left group disappears
};

const handleDeleteConversation = async (conv) => {
  const confirmed = window.confirm(`Delete chat with "${conv.other_username}"? It will only be removed from your side.`);
  if (!confirmed) return;
  try {
    await api.delete(`/conversations/${conv.id}/hide`);
    setConversations((prev) => prev.filter((c) => c.id !== conv.id));
    if (activeConversation?.id === conv.id) {
      setActiveConversation(null);
    }
  } catch (err) {
    console.error('Failed to delete conversation', err);
  }
};

  return (
    <div className="app-shell">
      <Sidebar
        conversations={conversations}
        activeConversation={activeConversation}
        onSelectConversation={handleSelectConversation}
        onConversationCreated={handleConversationCreated}
        onDeleteConversation={handleDeleteConversation}
      />
      {activeConversation ? (
        <ChatWindow
          conversation={activeConversation}
          onLeaveGroup={handleLeaveGroup}
          onConversationsRefresh={fetchConversations}
        />
      ) : (
        <div className="chat-empty">
          <div style={{ fontSize: 32 }}>💬</div>
          <div>Select a conversation to start chatting</div>
        </div>
      )}
    </div>
  );
}