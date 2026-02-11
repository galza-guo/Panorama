import { BrowserRouter, Route, Routes } from "react-router-dom";
import Docs from "./pages/Docs"; // To be implemented
import Home from "./pages/Home";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/docs/*" element={<Docs />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
