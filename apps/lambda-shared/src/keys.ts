export const teamPk = (teamId: string) => `TEAM#${teamId}`;
export const teamMetadataSk = "METADATA";
export const teamUserSk = (userId: string) => `USER#${userId}`;
export const boardSk = (boardId: string) => `BOARD#${boardId}`;
export const boardTrashSk = (boardId: string) => `BOARD#${boardId}#TRASH`;
export const boardElementsPk = (boardId: string) => `BOARD#${boardId}`;
export const boardElementSk = (elementId: string) => `ELEMENT#${elementId}`;
export const boardSnapshotSk = "STATE#SNAPSHOT";
export const boardSessionSk = (sessionId: string) => `SESSION#${sessionId}`;

export const gsi1Pk = (boardId: string) => `BOARD#${boardId}`;
export const gsi1Sk = (index: number) =>
  `ELEMENT#${index.toString().padStart(8, "0")}`;

export const gsi2PkUser = (userId: string) => `USER#${userId}`;
export const gsi2SkBoard = (boardId: string) => `BOARD#${boardId}`;
export const gsi2SkTeam = (teamId: string) => `TEAM#${teamId}`;
export const gsi2PkConnection = (connectionId: string) =>
  `CONNECTION#${connectionId}`;
export const gsi2SkConnection = (boardId: string) => `BOARD#${boardId}`;
export const gsi3Pk = (teamId: string) => `TEAM#${teamId}#TRASH`;
