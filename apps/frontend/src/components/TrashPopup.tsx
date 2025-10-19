import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { TrashBoard } from "../types/types";
import { BoardService } from "../services/boardService";
import { useBoardContext } from "../contexts/BoardProvider";
import Icon from "./Icon";
import logger from "../utils/logger";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import Loader from "./Loader";

interface TrashPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const TrashPopup = ({ isOpen, onClose }: TrashPopupProps) => {
  const [trashedBoards, setTrashedBoards] = useState<TrashBoard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { fetchBoards } = useBoardContext();

  const fetchTrashedBoards = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await BoardService.getTrashedBoards();
      setTrashedBoards(data);
    } catch (fetchError) {
      setError("Error connecting to server");
      logger.error("Error fetching trashed boards:", fetchError, true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    void fetchTrashedBoards();
  }, [fetchTrashedBoards, isOpen]);

  const handleRestore = async (boardId: string) => {
    try {
      await BoardService.restoreBoard(boardId);
      setTrashedBoards((prev) => prev.filter((board) => board.id !== boardId));
      await fetchBoards();
      navigate(`/board/${boardId}`);
      onClose();
    } catch (restoreError) {
      setError("Error connecting to server");
      logger.error("Error restoring board:", restoreError, true);
    }
  };

  const handlePermanentDelete = async (boardId: string) => {
    if (
      !window.confirm(
        "Are you sure you want to permanently delete this board? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      await BoardService.permanentlyDeleteBoard(boardId);
      setTrashedBoards((prev) => prev.filter((board) => board.id !== boardId));
    } catch (deleteError) {
      setError("Error connecting to server");
      logger.error("Error deleting board:", deleteError, true);
    }
  };

  const formatDate = (timestamp?: string) => {
    if (!timestamp) {
      return "Unknown";
    }
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => (!open ? onClose() : undefined)}
    >
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-lg">
        <div className="flex items-start justify-between gap-4">
          <DialogHeader className="space-y-2">
            <DialogTitle>Trashed Boards</DialogTitle>
            <DialogDescription>
              Restore a board to bring it back or permanently delete it to
              remove it forever.
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close trash dialog">
              <Icon name="close" />
            </Button>
          </DialogClose>
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader message="Loading trashed boards..." />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-center">
            <p className="text-sm text-destructive-foreground">{error}</p>
            <DialogFooter className="w-full justify-center sm:justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  onClose();
                  navigate("/");
                }}
              >
                Return to Home
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <ScrollArea className="max-h-[50vh] pr-3">
            {trashedBoards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No trashed boards found.
              </p>
            ) : (
              <div className="space-y-3">
                {trashedBoards.map((board) => (
                  <div
                    key={board.id}
                    className="flex flex-col gap-3 rounded-md border border-border bg-card/70 p-4 shadow-sm"
                  >
                    <div>
                      <h3 className="text-sm font-semibold">{board.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        Deleted on:{" "}
                        {formatDate(board.deletedAt ?? board.updatedAt)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button
                        variant="secondary"
                        onClick={() => handleRestore(board.id)}
                      >
                        Restore
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handlePermanentDelete(board.id)}
                      >
                        Delete Permanently
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TrashPopup;
