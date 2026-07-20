import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return; // don't connect if not logged in

    const newSocket = io('http://localhost:5000', {
      auth: { token }
    });

    newSocket.on('connect', () => console.log('🔌 Socket connected'));

    newSocket.on('connect_error', (err) => {
      console.log('Socket error:', err.message);
      // If it's specifically an auth problem, log the user out
      if (err.message === 'Invalid token' || err.message === 'No token provided') {
        localStorage.clear();
        window.location.href = '/login';
      }
    });

    setSocket(newSocket);

    return () => newSocket.disconnect();
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}