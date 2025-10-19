import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";

import { Board } from "../types/types";
import { useBoardContext } from "../contexts/BoardProvider";
import Icon from "./Icon";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

interface TabProps {
  board: Board;
  activeBoardId: string | undefined;
}

const Tab = ({ board, activeBoardId }: TabProps) => {
  const { handleRenameBoard, handleDeleteBoard } = useBoardContext();
  const navigate = useNavigate();

  const isActive = board.id === activeBoardId;
  const tabId = `board-name-input-${board.id}`;

  const handleNavigate = () => {
    if (!isActive) {
      navigate(`/board/${board.id}`);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNavigate();
    }
  };

  return (
    <div
      key={board.id}
      role="link"
      tabIndex={0}
      onClick={handleNavigate}
      onKeyDown={handleKeyDown}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex min-w-[200px] items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
        isActive
          ? "border-border bg-card text-foreground shadow-sm"
          : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted/80"
      )}
    >
      <label htmlFor={tabId} className="sr-only">
        Board Name
      </label>
      <Input
        id={tabId}
        value={board.name}
        onChange={(e) => handleRenameBoard(board.id, e.target.value)}
        aria-label={`Edit name for board ${board.name}`}
        readOnly={!isActive}
        onClick={(event) => {
          event.stopPropagation();
          if (!isActive) {
            handleNavigate();
          }
        }}
        className={cn(
          "h-8 border-none bg-transparent px-0 py-0 text-sm font-medium focus-visible:ring-0 focus-visible:ring-offset-0",
          isActive
            ? "cursor-text text-foreground"
            : "cursor-pointer text-muted-foreground"
        )}
      />
      {isActive && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={(event) => {
            event.stopPropagation();
            handleDeleteBoard(board.id);
          }}
          aria-label={`Move board ${board.name} to trash`}
        >
          <Icon name="close" />
        </Button>
      )}
    </div>
  );
};

export default Tab;
