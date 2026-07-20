import { useState } from 'react';
import './chat.css';

const EMOJI_CATEGORIES = {
  'Smileys': ['😀','😁','😂','🤣','😊','😍','😘','😜','🤔','😎','😴','😭','😡','🥳','🤗','😇','🙃','😉','😢','😱'],
  'Gestures': ['👍','👎','👏','🙌','🙏','💪','🤝','✌️','🤞','👋','🖐️','☝️','👌','🤟'],
  'Hearts': ['❤️','💛','💚','💙','💜','🖤','🤍','💔','💕','💞','💗'],
  'Objects': ['🔥','⭐','🎉','🎂','☕','🍕','🍔','⚽','🎵','💡','📌','⏰'],
};

export default function EmojiPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState('Smileys');

  return (
    <div className="composer-emoji-picker">
      <div className="composer-emoji-tabs">
        {Object.keys(EMOJI_CATEGORIES).map((cat) => (
          <button
            key={cat}
            className={`composer-emoji-tab ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
        <button className="modal-close" onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
      </div>
      <div className="composer-emoji-grid">
        {EMOJI_CATEGORIES[activeCategory].map((emoji) => (
          <button
            key={emoji}
            className="composer-emoji-item"
            onClick={() => onSelect(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}