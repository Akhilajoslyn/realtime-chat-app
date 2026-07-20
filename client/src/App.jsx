import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Chat from './pages/Chat';

function App() {
  const isLoggedIn = !!localStorage.getItem('token');

  return (
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/chat" element={isLoggedIn ? <Chat /> : <Navigate to="/login" />} />
          <Route path="/" element={<Navigate to={isLoggedIn ? '/chat' : '/login'} />} />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}

export default App;