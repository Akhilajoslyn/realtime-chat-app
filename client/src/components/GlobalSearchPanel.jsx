import { useState } from 'react';
import api from '../api/axios';
import './chat.css';

function highlightMatch(text, query) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: '#FFE08A', padding: '0 1px', borderRadius: 2 }}>{part}</mark>
      : part
  );
}

export default function GlobalSearchPanel({ conversations, onClose, onOpenConversation }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = async (value) => {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/search/messages', { params: { q: value } });
      setResults(res.data);
      setSearched(true);
    } catch (err) {
      console.error('Global search failed', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { day: '2-digit', month: 'short' }) + ' · ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleResultClick = (r) => {
    const conv = conversations.find((c) => c.id === r.conversation_id);
    if (conv) {
      onOpenConversation(conv);
    } else {
      // Fallback: build a minimal conversation object from the search result itself
      onOpenConversation({
        id: r.conversation_id,
        type: r.conversation_type,
        name: r.conversation_name,
        other_username: r.other_username
      });
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ height: '70vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="search-panel-header" style={{ borderBottom: '1px solid var(--border)' }}>
          <input
            autoFocus
            className="search-input"
            placeholder="Search all messages..."
            value={query}
            onChange={(e) => runSearch(e.target.value)}
          />
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="search-results">
          {loading && <p className="sidebar-empty" style={{ color: 'var(--text-muted)' }}>Searching...</p>}
          {!loading && searched && results.length === 0 && (
            <p className="sidebar-empty" style={{ color: 'var(--text-muted)' }}>No messages found.</p>
          )}
          {!loading && results.map((r) => {
            const chatLabel = r.conversation_type === 'group' ? r.conversation_name : r.other_username;
            return (
              <div key={r.id} className="search-result-item" style={{ cursor: 'pointer' }} onClick={() => handleResultClick(r)}>
                <div className="search-result-top">
                  <span className="search-result-sender">{r.sender_name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>in {chatLabel}</span></span>
                  <span className="search-result-date">{formatDate(r.created_at)}</span>
                </div>
                <div className="search-result-content">{highlightMatch(r.content, query)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}