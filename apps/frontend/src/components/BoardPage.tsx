import Header from './Header';
import { useBoardContext, useActiveBoardId } from "../contexts/BoardProvider";
import ExcalidrawEditor from './ExcalidrawEditor';
import Loader from './Loader';

const BoardPage = () => {
  const { isLoading, boards } = useBoardContext();
  const activeBoardId = useActiveBoardId();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader message="Loading board..." />
      </div>
    );
  }

  if (!activeBoardId || !boards.some(board => board.id === activeBoardId)) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-sm max-w-md mx-auto">
          <h2 className="text-xl font-semibold text-foreground mb-2">Board Not Found</h2>
          <p className="text-muted-foreground">
            The requested board could not be found. Please select a board or create a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <Header />
      <div className="relative flex flex-1 overflow-hidden bg-background">
        <ExcalidrawEditor boardId={activeBoardId} />
      </div>
    </div>
  );
};

export default BoardPage;
