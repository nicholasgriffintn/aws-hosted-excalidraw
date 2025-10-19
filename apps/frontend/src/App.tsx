import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import '@excalidraw/excalidraw/index.css';

import BoardPage from "./components/BoardPage";
import Loader from "./components/Loader";
import { BoardProvider, useBoardContext } from "./contexts/BoardProvider";
import { ThemeProvider } from "./contexts/ThemeProvider";
import { Button } from "./components/ui/button";

const HomePage = () => {
  const { isLoading, boards, handleCreateBoard } = useBoardContext();

  if (isLoading) {
    return <Loader />;
  }

  if (boards.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center p-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">No boards yet</h2>
          <p className="text-muted-foreground max-w-sm">
            Create your first board to get started with collaborative drawing.
          </p>
        </div>
        <Button onClick={handleCreateBoard} className="px-6 py-2">
          Create your first board
        </Button>
      </div>
    );
  }

  return <Navigate to={`/board/${boards[0].id}`} />;
};

const App = () => {
  return (
    <ThemeProvider>
      <Router>
        <BoardProvider>
          <div className="flex min-h-screen flex-col bg-background text-foreground antialiased">
            <Routes>
              <Route
                path="/board/:boardId"
                element={<BoardPage />}
              />
              <Route
                path="/"
                element={<HomePage />}
              />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        </BoardProvider>
      </Router>
    </ThemeProvider>
  );
};

export default App;
