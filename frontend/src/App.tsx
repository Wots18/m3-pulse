import { Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { MyBets } from './pages/MyBets';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/history" element={<History />} />
      <Route path="/mybets/:nametag" element={<MyBets />} />
    </Routes>
  );
}

export default App;
