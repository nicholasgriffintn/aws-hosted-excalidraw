import { useState } from 'react';

import TrashPopup from "./TrashPopup";
import Tab from "./Tab";
import { useBoardContext, useActiveBoardId } from "../contexts/BoardProvider";
import Icon from "./Icon";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

const Header = () => {
  const [isTrashPopupOpen, setIsTrashPopupOpen] = useState(false);

  const { boards, isLoading, handleCreateBoard } = useBoardContext();
  const activeBoardId = useActiveBoardId();

  if (isLoading) {
    return (
      <header className="flex h-14 items-center border-b border-border px-4 text-sm text-muted-foreground">
        Loading boards...
      </header>
    );
  }

  return (
    <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 text-foreground">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsTrashPopupOpen(true)}
        aria-label="Open trash"
        className="text-foreground hover:bg-accent"
      >
        <Icon name="trash" />
      </Button>

      <ScrollArea className="flex-1">
        <div className="flex items-center gap-2">
          {boards.map((board) => (
            <Tab key={board.id} board={board} activeBoardId={activeBoardId} />
          ))}
        </div>
      </ScrollArea>

      <Button
        onClick={handleCreateBoard}
        variant="outline"
        size="icon"
        aria-label="Create new board"
        className="border-border text-foreground hover:bg-accent"
      >
        <Icon name="plus" />
      </Button>

      <TrashPopup
        isOpen={isTrashPopupOpen}
        onClose={() => setIsTrashPopupOpen(false)}
      />
    </header>
  );
};

export default Header;
