import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
  useMemo,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { BoardService } from "../services/boardService";
import { Board } from "../types/types";
import Utils from "../utils";
import logger from "../utils/logger";

interface BoardContextType {
  boards: Board[];
  isLoading: boolean;
  fetchBoards: () => Promise<void>;
  handleRenameBoard: (id: string, newName: string) => void;
  handleCreateBoard: () => Promise<void>;
  handleDeleteBoard: (id: string) => Promise<void>;
}

const BoardContext = createContext<BoardContextType | null>(null);

export const useBoardContext = () => {
  const context = useContext(BoardContext);
  if (!context) {
    throw new Error("useBoardContext must be used within a BoardProvider");
  }
  return context;
};

// Hook to get the active board ID from URL parameters
export const useActiveBoardId = () => {
  const { boardId } = useParams<{ boardId: string }>();
  return boardId || undefined;
};

interface BoardProviderProps {
  children: ReactNode;
}

export const BoardProvider: React.FC<BoardProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const didAttemptInitialBoardCreation = useRef(false);

  const boardsQuery = useQuery({
    queryKey: ["boards"],
    queryFn: BoardService.getAllBoards,
    staleTime: 30_000,
  });

  const boards = boardsQuery.data ?? [];
  const isInitialLoading = boardsQuery.isLoading && boards.length === 0;

  const createBoardMutation = useMutation({
    mutationFn: BoardService.createBoard,
    onSuccess: (newBoard) => {
      queryClient.setQueryData<Board[]>(["boards"], (previous) => {
        const existing = previous ?? [];
        if (existing.some((board) => board.id === newBoard.id)) {
          return existing;
        }
        return [...existing, newBoard];
      });
      navigate(`/board/${newBoard.id}`);
    },
    onError: (error) => {
      logger.error("Failed to create board:", error, true);
    },
  });

  const deleteBoardMutation = useMutation({
    mutationFn: (id: string) => BoardService.moveToTrash(id),
    onError: (error, id) => {
      logger.error(`Failed to move board ${id} to trash:`, error, true);
    },
  });

  const debouncedUpdateBoardName = useMemo(
    () =>
      Utils.debounce((id: string, newName: string) => {
        BoardService.updateBoardName(id, newName).catch((error) => {
          logger.error(`Failed to update board ${id} name:`, error, true);
          queryClient
            .invalidateQueries({ queryKey: ["boards"] })
            .catch(() => undefined);
        });
      }, 500),
    [queryClient]
  );

  const handleRenameBoard = useCallback(
    (id: string, newName: string) => {
      queryClient.setQueryData<Board[]>(["boards"], (previous) =>
        (previous ?? []).map((board) =>
          board.id === id ? { ...board, name: newName } : board
        )
      );
      debouncedUpdateBoardName(id, newName);
    },
    [debouncedUpdateBoardName, queryClient]
  );

  const handleCreateBoard = useCallback(async () => {
    if (createBoardMutation.isPending || didAttemptInitialBoardCreation.current) {
      return;
    }
    await createBoardMutation.mutateAsync();
  }, [createBoardMutation]);

  const handleDeleteBoard = useCallback(
    async (id: string) => {
      if (deleteBoardMutation.isPending) {
        return;
      }

      const previousBoards =
        queryClient.getQueryData<Board[]>(["boards"]) ?? [];
      const boardToDelete = previousBoards.find((b) => b.id === id);
      if (!boardToDelete) return;

      const remainingBoards = previousBoards.filter((board) => board.id !== id);
      queryClient.setQueryData<Board[]>(["boards"], remainingBoards);

      try {
        await deleteBoardMutation.mutateAsync(id);

        // If no boards remain, navigate to home
        if (remainingBoards.length === 0) {
          navigate('/');
        }

        await queryClient.invalidateQueries({ queryKey: ["boards"] });
      } catch (error) {
        logger.error(`Failed to move board ${id} to trash:`, error, true);
        queryClient.setQueryData(["boards"], previousBoards);
        return;
      }
    },
    [
      deleteBoardMutation,
      navigate,
      queryClient,
    ]
  );

  useEffect(() => {
    if (
      !boardsQuery.isLoading &&
      boards.length === 0 &&
      !didAttemptInitialBoardCreation.current &&
      !createBoardMutation.isPending
    ) {
      didAttemptInitialBoardCreation.current = true;
      handleCreateBoard().finally(() => {
        didAttemptInitialBoardCreation.current = false;
      });
    }
  }, [boards, boardsQuery.isLoading, handleCreateBoard, createBoardMutation.isPending]);


  const fetchBoards = useCallback(async () => {
    await boardsQuery.refetch({ throwOnError: false });
  }, [boardsQuery]);

  const value = useMemo(
    () => ({
      boards,
      isLoading:
        isInitialLoading ||
        boardsQuery.isFetching ||
        createBoardMutation.isPending,
      fetchBoards,
      handleRenameBoard,
      handleCreateBoard,
      handleDeleteBoard,
    }),
    [
      boards,
      isInitialLoading,
      boardsQuery.isFetching,
      createBoardMutation.isPending,
      fetchBoards,
      handleRenameBoard,
      handleCreateBoard,
      handleDeleteBoard,
    ]
  );

  return (
    <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
  );
};